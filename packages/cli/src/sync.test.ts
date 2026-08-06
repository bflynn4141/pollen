import { describe, expect, it, beforeEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { initDb } from './store.js'
import { SYNC_BATCH_SIZE } from './config.js'
import { syncToNeon } from './sync.js'

interface RecordedQuery {
  text: string
  params: unknown[]
}

// Mocked neon client: records every call so tests can assert on statement
// shape and parameters. Tagged-template calls (watermarks, sync_meta reads,
// contributor upsert) and .query() calls (batched inserts) are recorded
// separately.
const mock = vi.hoisted(() => {
  const taggedCalls: { text: string; params: unknown[] }[] = []
  const queryCalls: { text: string; params: unknown[] }[] = []
  let metaRows: { key: string; value: string }[] = []
  let failWhen: ((text: string, params: unknown[]) => boolean) | null = null

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('$?')
    taggedCalls.push({ text, params: values })
    if (text.includes('FROM sync_meta')) return Promise.resolve(metaRows)
    return Promise.resolve([])
  }
  sql.query = (text: string, params: unknown[]) => {
    queryCalls.push({ text, params })
    if (failWhen?.(text, params)) {
      return Promise.reject(new Error('invalid input syntax for type bigint'))
    }
    return Promise.resolve([])
  }

  return {
    sql,
    taggedCalls,
    queryCalls,
    setMeta(rows: { key: string; value: string }[]) {
      metaRows = rows
    },
    setFail(fn: (text: string, params: unknown[]) => boolean) {
      failWhen = fn
    },
    reset() {
      taggedCalls.length = 0
      queryCalls.length = 0
      metaRows = []
      failWhen = null
    },
  }
})

vi.mock('@neondatabase/serverless', () => ({
  neon: () => mock.sql,
}))

vi.mock('./config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config.js')>()
  return {
    ...actual,
    getOrCreateContributorId: () => 'contrib-test',
    loadConfig: () => null,
  }
})

vi.mock('./finalize.js', () => ({
  finalizeStaleSessions: vi.fn(),
}))

const CONN = 'postgres://user:pass@host/db'

function seedContribution(db: Database.Database, id: string, timestamp: number, extra: Record<string, unknown> = {}) {
  db.prepare(`
    INSERT INTO contributions (id, timestamp, session_id, keywords, tools_chain, has_error_trace, has_code_block, intent, contributor_id)
    VALUES (@id, @timestamp, @session_id, @keywords, @tools_chain, @has_error_trace, @has_code_block, @intent, @contributor_id)
  `).run({
    id,
    timestamp,
    session_id: 's-1',
    keywords: '["a","b"]',
    tools_chain: null,
    has_error_trace: 0,
    has_code_block: 1,
    intent: 'debug',
    contributor_id: null,
    ...extra,
  })
}

function seedToolEvent(db: Database.Database, id: string, timestamp: number, extra: Record<string, unknown> = {}) {
  db.prepare(`
    INSERT INTO tool_events (id, session_id, timestamp, tool_name, tool_category, success, sequence_number, response_has_code)
    VALUES (@id, @session_id, @timestamp, @tool_name, @tool_category, @success, @sequence_number, @response_has_code)
  `).run({
    id,
    session_id: 's-1',
    timestamp,
    tool_name: 'Read',
    tool_category: 'read',
    success: 1,
    sequence_number: 0,
    response_has_code: null,
    ...extra,
  })
}

function seedSession(db: Database.Database, sessionId: string, startedAt: number, extra: Record<string, unknown> = {}) {
  db.prepare(`
    INSERT INTO sessions (session_id, started_at, model, unique_tools, transcript_path)
    VALUES (@session_id, @started_at, @model, @unique_tools, @transcript_path)
  `).run({
    session_id: sessionId,
    started_at: startedAt,
    model: 'claude-sonnet-4-6',
    unique_tools: '["Read"]',
    transcript_path: null,
    ...extra,
  })
}

function insertsInto(table: string): RecordedQuery[] {
  return mock.queryCalls.filter((c) => c.text.startsWith(`INSERT INTO ${table} `))
}

function tupleCount(text: string): number {
  return (text.match(/\(\$\d+/g) ?? []).length
}

describe('syncToNeon batching', () => {
  let db: Database.Database

  beforeEach(() => {
    mock.reset()
    db = initDb()
  })

  it('batches contributions into multi-row INSERT statements of SYNC_BATCH_SIZE', async () => {
    const total = SYNC_BATCH_SIZE * 2 + 50
    for (let i = 0; i < total; i++) {
      seedContribution(db, `c-${String(i).padStart(4, '0')}`, 1000 + i)
    }

    const result = await syncToNeon(db, CONN)

    expect(result.contributions).toBe(total)
    const inserts = insertsInto('contributions')
    expect(inserts).toHaveLength(3)
    expect(tupleCount(inserts[0].text)).toBe(SYNC_BATCH_SIZE)
    expect(tupleCount(inserts[1].text)).toBe(SYNC_BATCH_SIZE)
    expect(tupleCount(inserts[2].text)).toBe(50)
    // 26 columns per contribution row
    expect(inserts[0].params).toHaveLength(SYNC_BATCH_SIZE * 26)
    expect(inserts[2].params).toHaveLength(50 * 26)
    // placeholders are numbered sequentially across the whole statement
    expect(inserts[0].text).toContain(`($${SYNC_BATCH_SIZE * 26 - 25}, `)
  })

  it('issues one round-trip per batch, not per row', async () => {
    for (let i = 0; i < 5; i++) {
      seedToolEvent(db, `t-${i}`, 2000 + i)
    }

    await syncToNeon(db, CONN)

    const inserts = insertsInto('tool_events')
    expect(inserts).toHaveLength(1)
    expect(tupleCount(inserts[0].text)).toBe(5)
  })

  it('preserves the ON CONFLICT clause for every table', async () => {
    seedContribution(db, 'c-1', 1000)
    seedToolEvent(db, 't-1', 1000)
    seedSession(db, 's-1', 1000)
    db.prepare(`
      INSERT INTO lifecycle_events (id, session_id, timestamp, event_type)
      VALUES ('l-1', 's-1', 1000, 'session_start')
    `).run()
    db.prepare(`
      INSERT INTO x402_events (id, session_id, timestamp, tool_name, mcp_server, success)
      VALUES ('x-1', 's-1', 1000, 'fetch', 'agentcash', 1)
    `).run()

    await syncToNeon(db, CONN)

    const contrib = insertsInto('contributions')[0].text
    expect(contrib).toContain('ON CONFLICT (id) DO UPDATE SET')
    expect(contrib).toContain('timestamp = EXCLUDED.timestamp')
    expect(contrib).toContain('permission_mode = EXCLUDED.permission_mode')

    expect(insertsInto('tool_events')[0].text).toContain('ON CONFLICT (id) DO NOTHING')

    const sess = insertsInto('sessions')[0].text
    expect(sess).toContain('ON CONFLICT (session_id) DO UPDATE SET')
    expect(sess).toContain('transcript_path = COALESCE(EXCLUDED.transcript_path, sessions.transcript_path)')
    expect(sess).toContain('cached_input_tokens = EXCLUDED.cached_input_tokens')

    expect(insertsInto('lifecycle_events')[0].text).toContain('ON CONFLICT (id) DO NOTHING')
    expect(insertsInto('x402_events')[0].text).toContain('ON CONFLICT (id) DO NOTHING')
  })

  it('applies toInt/toBool/safeJsonb coercions to batched params', async () => {
    seedContribution(db, 'c-1', 1000.7, {
      keywords: '["a","b"]',
      tools_chain: 'not-json',
      has_error_trace: 1,
      has_code_block: 0,
    })

    await syncToNeon(db, CONN)

    const params = insertsInto('contributions')[0].params
    // column order: id, timestamp, session_id, keywords, tools_chain, ...
    expect(params[0]).toBe('c-1')
    expect(params[1]).toBe(1000) // fractional REAL truncated for BIGINT
    expect(params[3]).toBe('["a","b"]') // valid JSON passes through
    expect(params[4]).toBeNull() // invalid JSON nulled for JSONB
    // ..., session_depth, has_error_trace, has_code_block, ...
    expect(params[11]).toBe(true) // SQLite 1 -> boolean
    expect(params[12]).toBe(false) // SQLite 0 -> boolean
  })

  it('preserves nullable boolean coercion for tool_events', async () => {
    seedToolEvent(db, 't-1', 1000, { success: 0, response_has_code: null })
    seedToolEvent(db, 't-2', 1001, { success: 1, response_has_code: 1 })

    await syncToNeon(db, CONN)

    const params = insertsInto('tool_events')[0].params
    // 23 columns per row; success at index 5, response_has_code at index 16
    expect(params[5]).toBe(false)
    expect(params[16]).toBeNull()
    expect(params[23 + 5]).toBe(true)
    expect(params[23 + 16]).toBe(true)
  })

  it('fills in contributor_id when the local row has none', async () => {
    seedContribution(db, 'c-1', 1000, { contributor_id: null })
    seedContribution(db, 'c-2', 1001, { contributor_id: 'someone-else' })

    await syncToNeon(db, CONN)

    const params = insertsInto('contributions')[0].params
    // contributor_id is column 25 of 26 (index 24)
    expect(params[24]).toBe('contrib-test')
    expect(params[26 + 24]).toBe('someone-else')
  })

  it('only syncs rows past the watermark and advances it to the max timestamp', async () => {
    mock.setMeta([{ key: 'last_sync_contributions', value: '1500' }])
    seedContribution(db, 'c-old', 1400) // behind watermark, skipped
    seedContribution(db, 'c-new-1', 1600)
    seedContribution(db, 'c-new-2', 1900)

    const result = await syncToNeon(db, CONN)

    expect(result.contributions).toBe(2)
    expect(tupleCount(insertsInto('contributions')[0].text)).toBe(2)

    const watermark = mock.taggedCalls.find(
      (c) => c.text.includes('UPDATE sync_meta') && c.text.includes('last_sync_contributions')
    )
    expect(watermark).toBeDefined()
    expect(watermark!.params).toEqual(['1900'])
  })

  it('re-syncs sessions within the 7-day overlap window behind the watermark', async () => {
    const DAY = 24 * 60 * 60 * 1000
    const watermark = 100 * DAY
    mock.setMeta([{ key: 'last_sync_sessions', value: String(watermark) }])

    seedSession(db, 's-ancient', watermark - 8 * DAY) // outside window, skipped
    seedSession(db, 's-recent', watermark - 3 * DAY) // inside window, re-synced
    seedSession(db, 's-new', watermark + DAY)

    const result = await syncToNeon(db, CONN)

    expect(result.sessions).toBe(2)
    const inserts = insertsInto('sessions')
    expect(inserts).toHaveLength(1)
    expect(tupleCount(inserts[0].text)).toBe(2)
    const sessionIds = [inserts[0].params[0], inserts[0].params[38]]
    expect(sessionIds).toEqual(['s-recent', 's-new'])

    // Watermark still advances to max started_at, not the window start
    const wm = mock.taggedCalls.find(
      (c) => c.text.includes('UPDATE sync_meta') && c.text.includes('last_sync_sessions')
    )
    expect(wm!.params).toEqual([String(watermark + DAY)])
  })

  it('upserts contributor identity before syncing tables', async () => {
    seedContribution(db, 'c-1', 1000)

    await syncToNeon(db, CONN)

    const contributorUpsert = mock.taggedCalls.findIndex((c) =>
      c.text.includes('INSERT INTO contributors')
    )
    const metaRead = mock.taggedCalls.findIndex((c) => c.text.includes('FROM sync_meta'))
    expect(contributorUpsert).toBeGreaterThanOrEqual(0)
    expect(metaRead).toBeGreaterThan(contributorUpsert)
    expect(mock.taggedCalls[contributorUpsert].params[0]).toBe('contrib-test')
  })

  it('retries a failed batch row-at-a-time, landing good rows and rethrowing at the poison row', async () => {
    for (let i = 0; i < 5; i++) {
      seedContribution(db, `c-${i}`, 1000 + i)
    }
    // Any statement whose params include the poison row fails — so the full
    // batch fails, then per-row retries succeed until the poison row itself.
    mock.setFail((_text, params) => params.includes('c-2'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(syncToNeon(db, CONN)).rejects.toThrow('invalid input syntax')

    const inserts = insertsInto('contributions')
    // 1 failed batch of 5, then single-row retries: c-0, c-1 (ok), c-2 (throws)
    expect(inserts).toHaveLength(4)
    expect(tupleCount(inserts[0].text)).toBe(5)
    expect(inserts.slice(1).map((c) => tupleCount(c.text))).toEqual([1, 1, 1])
    expect(inserts.slice(1).map((c) => c.params[0])).toEqual(['c-0', 'c-1', 'c-2'])
    // fallback rows keep the same conflict clause
    expect(inserts[1].text).toContain('ON CONFLICT (id) DO UPDATE SET')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('contributions row c-2 failed'))

    // watermark must not advance past the failure
    const watermarks = mock.taggedCalls.filter((c) => c.text.includes('UPDATE sync_meta'))
    expect(watermarks).toHaveLength(0)
    warn.mockRestore()
  })

  it('recovers fully when a batch failure is transient (per-row retries all succeed)', async () => {
    for (let i = 0; i < 3; i++) {
      seedContribution(db, `c-${i}`, 1000 + i)
    }
    // Fail only multi-row statements: the batch bounces, every row lands solo.
    mock.setFail((text) => text.startsWith('INSERT INTO contributions') && tupleCount(text) > 1)

    const result = await syncToNeon(db, CONN)

    expect(result.contributions).toBe(3)
    expect(insertsInto('contributions')).toHaveLength(4) // 1 failed batch + 3 rows
    const watermark = mock.taggedCalls.find(
      (c) => c.text.includes('UPDATE sync_meta') && c.text.includes('last_sync_contributions')
    )
    expect(watermark!.params).toEqual(['1002'])
  })

  it('issues no INSERTs and leaves watermarks untouched when there is nothing to sync', async () => {
    const result = await syncToNeon(db, CONN)

    expect(result).toEqual({
      contributions: 0,
      tool_events: 0,
      sessions: 0,
      lifecycle_events: 0,
      x402_events: 0,
      scored: 0,
    })
    expect(mock.queryCalls).toHaveLength(0)
    const watermarkWrites = mock.taggedCalls.filter((c) => c.text.includes('sync_meta') && !c.text.includes('SELECT'))
    expect(watermarkWrites).toHaveLength(0)
  })
})
