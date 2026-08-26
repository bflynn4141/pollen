import { describe, expect, it, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import type { Contribution } from './types.js'
import {
  initDb,
  insertContribution,
  getSessionPromptCount,
  queryIntentDistribution,
  queryLanguageDistribution,
  queryToolUsage,
  querySessionStats,
  queryTimePatterns,
  getStats,
  insertToolEvent,
  getToolEventCount,
  queryToolFrequency,
  queryToolPairs,
  queryToolFailures,
  queryToolTriples,
  insertSession,
  updateSession,
  getSession,
  querySessionSummaries,
  querySessionArcs,
  queryMcpServerUsage,
  queryProjectDistribution,
  incrementResponseStats,
  getSessionResponseStats,
  queryTopicDistribution,
  queryActionDistribution,
  queryActionTopicCombinations,
} from './store.js'
import type { CoarsenedToolEvent, SessionRecord } from './types.js'

function makeContribution(overrides: Partial<Contribution> = {}): Contribution {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    session_id: 'session-1',
    features: {
      keywords: ['fix', 'error'],
      tools_chain: ['Read', 'Edit'],
      language_signals: ['typescript'],
      frameworks: ['react'],
      prompt_length: 'medium',
      code_ratio: 'low',
      structure_type: 'imperative',
      session_depth: 'first',
      has_error_trace: false,
      has_code_block: false,
      day_of_week: 'monday',
      hour_bucket: 'morning',
    },
    labels: {
      intent: 'debugging',
      complexity: 'moderate',
      prompt_style: 'directive',
      domain: 'web_frontend',
      taxonomy_version: 'v1.0',
      confidence: 0.9,
    },
    action: null,
    topic: null,
    ...overrides,
  }
}

describe('store', () => {
  let db: Database.Database

  beforeEach(() => {
    db = initDb()
  })

  it('creates the contributions table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    expect(tables.map(t => t.name)).toContain('contributions')
  })

  it('creates the normalized token usage columns', () => {
    const columns = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
    expect(columns.map(column => column.name)).toEqual(expect.arrayContaining([
      'input_tokens',
      'output_tokens',
      'cached_input_tokens',
      'reasoning_tokens',
    ]))
  })

  it('inserts and reads back a contribution', () => {
    const c = makeContribution({ id: 'test-1' })
    insertContribution(db, c)

    const row = db.prepare('SELECT * FROM contributions WHERE id = ?').get('test-1') as Record<string, unknown>
    expect(row.intent).toBe('debugging')
    expect(row.prompt_length).toBe('medium')
    expect(JSON.parse(row.keywords as string)).toEqual(['fix', 'error'])
  })

  it('round-trips JSON arrays correctly', () => {
    const c = makeContribution({
      id: 'test-2',
      features: {
        ...makeContribution().features,
        language_signals: ['typescript', 'python'],
        tools_chain: ['Read', 'Bash', 'Edit'],
      },
    })
    insertContribution(db, c)

    const row = db.prepare('SELECT * FROM contributions WHERE id = ?').get('test-2') as Record<string, unknown>
    expect(JSON.parse(row.language_signals as string)).toEqual(['typescript', 'python'])
    expect(JSON.parse(row.tools_chain as string)).toEqual(['Read', 'Bash', 'Edit'])
  })

  it('counts session prompts correctly', () => {
    expect(getSessionPromptCount(db, 'session-1')).toBe(0)

    insertContribution(db, makeContribution({ session_id: 'session-1' }))
    insertContribution(db, makeContribution({ session_id: 'session-1' }))
    insertContribution(db, makeContribution({ session_id: 'session-2' }))

    expect(getSessionPromptCount(db, 'session-1')).toBe(2)
    expect(getSessionPromptCount(db, 'session-2')).toBe(1)
  })

  it('queries intent distribution', () => {
    insertContribution(db, makeContribution({ labels: { ...makeContribution().labels, intent: 'debugging' } }))
    insertContribution(db, makeContribution({ labels: { ...makeContribution().labels, intent: 'debugging' } }))
    insertContribution(db, makeContribution({ labels: { ...makeContribution().labels, intent: 'feature_build' } }))

    const dist = queryIntentDistribution(db)
    expect(dist[0].intent).toBe('debugging')
    expect(dist[0].count).toBe(2)
    expect(dist[1].intent).toBe('feature_build')
    expect(dist[1].count).toBe(1)
  })

  it('queries language distribution via json_each', () => {
    insertContribution(db, makeContribution({
      features: { ...makeContribution().features, language_signals: ['typescript', 'python'] },
    }))
    insertContribution(db, makeContribution({
      features: { ...makeContribution().features, language_signals: ['typescript'] },
    }))

    const langs = queryLanguageDistribution(db)
    expect(langs[0].language).toBe('typescript')
    expect(langs[0].count).toBe(2)
  })

  it('queries tool usage via json_each', () => {
    insertContribution(db, makeContribution({
      features: { ...makeContribution().features, tools_chain: ['Read', 'Edit'] },
    }))
    insertContribution(db, makeContribution({
      features: { ...makeContribution().features, tools_chain: ['Read'] },
    }))

    const tools = queryToolUsage(db)
    expect(tools[0].tool).toBe('Read')
    expect(tools[0].count).toBe(2)
  })

  it('queries session stats', () => {
    insertContribution(db, makeContribution({ session_id: 'a' }))
    insertContribution(db, makeContribution({ session_id: 'a' }))
    insertContribution(db, makeContribution({ session_id: 'b' }))

    const stats = querySessionStats(db)
    expect(stats.avg).toBe(1.5)
    expect(stats.sessions).toHaveLength(2)
  })

  it('queries time patterns', () => {
    insertContribution(db, makeContribution({
      features: { ...makeContribution().features, hour_bucket: 'morning', day_of_week: 'monday' },
    }))
    insertContribution(db, makeContribution({
      features: { ...makeContribution().features, hour_bucket: 'morning', day_of_week: 'tuesday' },
    }))

    const patterns = queryTimePatterns(db)
    expect(patterns.byHour[0].bucket).toBe('morning')
    expect(patterns.byHour[0].count).toBe(2)
  })

  it('returns overall stats', () => {
    expect(getStats(db).total).toBe(0)

    insertContribution(db, makeContribution({ session_id: 'a' }))
    insertContribution(db, makeContribution({ session_id: 'b' }))

    const stats = getStats(db)
    expect(stats.total).toBe(2)
    expect(stats.uniqueSessions).toBe(2)
    expect(stats.firstSeen).not.toBeNull()
  })
})

function makeToolEvent(overrides: Partial<CoarsenedToolEvent> = {}): CoarsenedToolEvent {
  return {
    id: crypto.randomUUID(),
    session_id: 'session-1',
    timestamp: Date.now(),
    tool_name: 'Read',
    tool_category: 'read',
    success: true,
    error_category: null,
    file_extension: '.ts',
    command_category: null,
    sequence_number: 0,
    mcp_server: null,
    duration_ms: null,
    ...overrides,
  }
}

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    session_id: 'session-1',
    model: 'claude-sonnet-4-6',
    source: 'claude-code',
    started_at: Date.now(),
    ended_at: null,
    duration_bucket: null,
    prompt_count: 0,
    tool_use_count: 0,
    tool_failure_count: 0,
    intent_sequence: null,
    dominant_intent: null,
    dominant_domain: null,
    unique_tools: null,
    languages_used: null,
    outcome: null,
    project_type: null,
    end_reason: null,
    mcp_servers_used: null,
    response_count: 0,
    avg_response_length: 0,
    satisfaction_score: null,
    satisfaction_signals: null,
    subject: null,
    ...overrides,
  }
}

describe('tool_events store', () => {
  let db: Database.Database

  beforeEach(() => {
    db = initDb()
  })

  it('creates the tool_events table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    expect(tables.map(t => t.name)).toContain('tool_events')
  })

  it('inserts and counts tool events', () => {
    expect(getToolEventCount(db, 'session-1')).toBe(0)

    insertToolEvent(db, makeToolEvent({ sequence_number: 0 }))
    insertToolEvent(db, makeToolEvent({ sequence_number: 1 }))

    expect(getToolEventCount(db, 'session-1')).toBe(2)
  })

  it('queries tool frequency with success/failure counts', () => {
    insertToolEvent(db, makeToolEvent({ tool_name: 'Read', success: true }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Read', success: true }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Read', success: true }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Bash', success: true }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Bash', success: false, error_category: 'runtime' }))

    const freq = queryToolFrequency(db)
    expect(freq[0].tool_name).toBe('Read')
    expect(freq[0].count).toBe(3)
    expect(freq[0].success_count).toBe(3)
    expect(freq[0].failure_count).toBe(0)
    expect(freq[1].tool_name).toBe('Bash')
    expect(freq[1].failure_count).toBe(1)
  })

  it('queries tool pairs with self-loop dedup', () => {
    insertToolEvent(db, makeToolEvent({ tool_name: 'Grep', sequence_number: 0 }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Read', sequence_number: 1 }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Edit', sequence_number: 2 }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Grep', sequence_number: 3 }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Read', sequence_number: 4 }))

    const pairs = queryToolPairs(db)
    const grepRead = pairs.find(p => p.tool_a === 'Grep' && p.tool_b === 'Read')
    expect(grepRead).toBeDefined()
    expect(grepRead!.count).toBe(2)
  })

  it('filters out self-loops from tool pairs', () => {
    // Simulate parallel Bash calls (self-loops)
    insertToolEvent(db, makeToolEvent({ tool_name: 'Bash', sequence_number: 0 }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Bash', sequence_number: 1 }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Bash', sequence_number: 2 }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Read', sequence_number: 3 }))

    const pairs = queryToolPairs(db)
    const bashBash = pairs.find(p => p.tool_a === 'Bash' && p.tool_b === 'Bash')
    expect(bashBash).toBeUndefined() // Self-loops should be filtered
    const bashRead = pairs.find(p => p.tool_a === 'Bash' && p.tool_b === 'Read')
    expect(bashRead).toBeDefined()
  })

  it('queries tool triples with dedup', () => {
    insertToolEvent(db, makeToolEvent({ tool_name: 'Grep', sequence_number: 0 }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Read', sequence_number: 1 }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Edit', sequence_number: 2 }))

    const triples = queryToolTriples(db)
    const grepReadEdit = triples.find(t => t.tool_a === 'Grep' && t.tool_b === 'Read' && t.tool_c === 'Edit')
    expect(grepReadEdit).toBeDefined()
    expect(grepReadEdit!.count).toBe(1)
  })

  it('queries tool failures by category', () => {
    insertToolEvent(db, makeToolEvent({ tool_name: 'Bash', success: false, error_category: 'runtime' }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Bash', success: false, error_category: 'runtime' }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'Read', success: false, error_category: 'not_found' }))

    const failures = queryToolFailures(db)
    expect(failures[0].tool_name).toBe('Bash')
    expect(failures[0].error_category).toBe('runtime')
    expect(failures[0].count).toBe(2)
    expect(failures[1].tool_name).toBe('Read')
    expect(failures[1].error_category).toBe('not_found')
  })
})

describe('topic queries', () => {
  let db: Database.Database

  beforeEach(() => {
    db = initDb()
  })

  it('queries topic distribution', () => {
    insertContribution(db, makeContribution({ topic: 'auth' }))
    insertContribution(db, makeContribution({ topic: 'auth' }))
    insertContribution(db, makeContribution({ topic: 'database' }))
    insertContribution(db, makeContribution({ topic: null }))

    const dist = queryTopicDistribution(db)
    expect(dist[0].topic).toBe('auth')
    expect(dist[0].count).toBe(2)
    expect(dist[1].topic).toBe('database')
    expect(dist).toHaveLength(2) // null excluded
  })

  it('queries action distribution', () => {
    insertContribution(db, makeContribution({ action: 'fix' }))
    insertContribution(db, makeContribution({ action: 'fix' }))
    insertContribution(db, makeContribution({ action: 'create' }))

    const dist = queryActionDistribution(db)
    expect(dist[0].action).toBe('fix')
    expect(dist[0].count).toBe(2)
  })

  it('queries action+topic combinations', () => {
    insertContribution(db, makeContribution({ action: 'fix', topic: 'auth' }))
    insertContribution(db, makeContribution({ action: 'fix', topic: 'auth' }))
    insertContribution(db, makeContribution({ action: 'create', topic: 'api' }))

    const combos = queryActionTopicCombinations(db)
    expect(combos[0].action).toBe('fix')
    expect(combos[0].topic).toBe('auth')
    expect(combos[0].count).toBe(2)
  })
})

describe('MCP server queries', () => {
  let db: Database.Database

  beforeEach(() => {
    db = initDb()
  })

  it('queries MCP server usage', () => {
    insertToolEvent(db, makeToolEvent({ tool_name: 'mcp__clara__wallet_send', mcp_server: 'clara', session_id: 'a' }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'mcp__clara__wallet_send', mcp_server: 'clara', session_id: 'b' }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'mcp__herd__getBalance', mcp_server: 'herd', session_id: 'a' }))
    insertToolEvent(db, makeToolEvent({ tool_name: 'mcp__herd__getBalance', mcp_server: 'herd', success: false, error_category: 'runtime', session_id: 'a' }))

    const servers = queryMcpServerUsage(db)
    expect(servers).toHaveLength(2)

    const clara = servers.find(s => s.mcp_server === 'clara')!
    expect(clara.call_count).toBe(2)
    expect(clara.success_count).toBe(2)
    expect(clara.unique_sessions).toBe(2)

    const herd = servers.find(s => s.mcp_server === 'herd')!
    expect(herd.call_count).toBe(2)
    expect(herd.failure_count).toBe(1)
    expect(herd.unique_sessions).toBe(1)
  })

  it('returns empty when no MCP tools used', () => {
    insertToolEvent(db, makeToolEvent({ tool_name: 'Read' }))
    expect(queryMcpServerUsage(db)).toHaveLength(0)
  })
})

describe('response stats', () => {
  let db: Database.Database

  beforeEach(() => {
    db = initDb()
    insertSession(db, makeSession({ session_id: 'resp-test' }))
  })

  it('increments response count and averages length', () => {
    incrementResponseStats(db, 'resp-test', 500)
    let stats = getSessionResponseStats(db, 'resp-test')
    expect(stats.response_count).toBe(1)
    expect(stats.avg_response_length).toBe(500)

    incrementResponseStats(db, 'resp-test', 1000)
    stats = getSessionResponseStats(db, 'resp-test')
    expect(stats.response_count).toBe(2)
    expect(stats.avg_response_length).toBe(750)
  })
})

describe('sessions store', () => {
  let db: Database.Database

  beforeEach(() => {
    db = initDb()
  })

  it('creates the sessions table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    expect(tables.map(t => t.name)).toContain('sessions')
  })

  it('inserts and retrieves a session', () => {
    const s = makeSession({ session_id: 'test-session' })
    insertSession(db, s)

    const retrieved = getSession(db, 'test-session')
    expect(retrieved).toBeDefined()
    expect(retrieved!.model).toBe('claude-sonnet-4-6')
  })

  it('updates session fields', () => {
    insertSession(db, makeSession({ session_id: 'test-session' }))

    updateSession(db, {
      session_id: 'test-session',
      ended_at: Date.now(),
      prompt_count: 10,
      tool_use_count: 25,
      dominant_intent: 'debugging',
      outcome: 'completed',
      duration_bucket: 'medium',
    })

    const s = getSession(db, 'test-session')!
    expect(s.prompt_count).toBe(10)
    expect(s.tool_use_count).toBe(25)
    expect(s.dominant_intent).toBe('debugging')
    expect(s.outcome).toBe('completed')
    expect(s.duration_bucket).toBe('medium')
  })

  it('ignores duplicate session inserts', () => {
    insertSession(db, makeSession({ session_id: 'dup' }))
    insertSession(db, makeSession({ session_id: 'dup' })) // should not throw

    const count = db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }
    expect(count.c).toBe(1)
  })

  it('queries session summaries ordered by start time', () => {
    insertSession(db, makeSession({ session_id: 'old', started_at: 1000 }))
    insertSession(db, makeSession({ session_id: 'new', started_at: 2000 }))

    const summaries = querySessionSummaries(db)
    expect(summaries[0].session_id).toBe('new')
    expect(summaries[1].session_id).toBe('old')
  })

  it('queries project distribution', () => {
    insertSession(db, makeSession({ session_id: 'p1', project_type: 'node' }))
    insertSession(db, makeSession({ session_id: 'p2', project_type: 'node' }))
    insertSession(db, makeSession({ session_id: 'p3', project_type: 'rust' }))

    const dist = queryProjectDistribution(db)
    expect(dist[0].project_type).toBe('node')
    expect(dist[0].session_count).toBe(2)
    expect(dist[1].project_type).toBe('rust')
    expect(dist[1].session_count).toBe(1)
  })

  it('queries session arcs', () => {
    insertSession(db, makeSession({
      session_id: 'a',
      dominant_intent: 'debugging',
      outcome: 'completed',
    }))
    insertSession(db, makeSession({
      session_id: 'b',
      dominant_intent: 'debugging',
      outcome: 'completed',
    }))
    insertSession(db, makeSession({
      session_id: 'c',
      dominant_intent: 'feature_build',
      outcome: 'abandoned',
    }))

    const arcs = querySessionArcs(db)
    expect(arcs[0].dominant_intent).toBe('debugging')
    expect(arcs[0].outcome).toBe('completed')
    expect(arcs[0].count).toBe(2)
  })
})
