import { describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { maybeBuildNudge, maybeScheduleWeeklyBrief } from './brief-trigger.js'
import { handleSessionStart } from './session-start.js'
import { getBriefKv, getBriefLog, initDb, insertSession } from '../store.js'
import type { PollenConfig } from '../config.js'
import type { SessionRecord } from '../types.js'

const configWithEmail = (): PollenConfig => ({ contributor_id: 'c-1', brief_email: 'me@example.com' })

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    session_id: crypto.randomUUID(),
    model: 'claude-sonnet-4-6',
    source: 'claude-code',
    started_at: Date.now() - 1000,
    ended_at: Date.now(),
    duration_bucket: 'medium',
    prompt_count: 5,
    tool_use_count: 3,
    tool_failure_count: 0,
    intent_sequence: null,
    dominant_intent: null,
    dominant_domain: null,
    unique_tools: null,
    languages_used: null,
    outcome: 'completed',
    project_type: null,
    end_reason: null,
    mcp_servers_used: null,
    response_count: 0,
    avg_response_length: 0,
    satisfaction_score: 60,
    satisfaction_signals: null,
    subject: null,
    contributor_id: 'c-1',
    permission_mode: null,
    subagent_count: 0,
    ...overrides,
  } as SessionRecord
}

/** Seed enough prompted sessions that at least one coaching rule fires. */
function seedFiringDb(db: Database.Database): void {
  for (let i = 0; i < 45; i++) {
    insertSession(db, makeSession())
  }
}

describe('maybeScheduleWeeklyBrief — weekly trigger idempotency', () => {
  it('claims the week and spawns exactly once; second call same week no-ops', () => {
    const db = initDb()
    const spawnBriefSend = vi.fn()
    const deps = { spawnBriefSend, loadConfigFn: configWithEmail, now: new Date(2026, 7, 6) }

    expect(maybeScheduleWeeklyBrief(db, deps)).toBe(true)
    expect(spawnBriefSend).toHaveBeenCalledTimes(1)
    expect(getBriefLog(db, '2026-W32')).toBeDefined()

    // Second session in the same week: claim fails, no second send
    expect(maybeScheduleWeeklyBrief(db, deps)).toBe(false)
    expect(spawnBriefSend).toHaveBeenCalledTimes(1)
    db.close()
  })

  it('a new ISO week gets its own send', () => {
    const db = initDb()
    const spawnBriefSend = vi.fn()
    expect(maybeScheduleWeeklyBrief(db, { spawnBriefSend, loadConfigFn: configWithEmail, now: new Date(2026, 7, 6) })).toBe(true)
    expect(maybeScheduleWeeklyBrief(db, { spawnBriefSend, loadConfigFn: configWithEmail, now: new Date(2026, 7, 13) })).toBe(true)
    expect(spawnBriefSend).toHaveBeenCalledTimes(2)
    db.close()
  })

  it('does nothing when no recipient is configured', () => {
    const db = initDb()
    const spawnBriefSend = vi.fn()
    expect(maybeScheduleWeeklyBrief(db, {
      spawnBriefSend,
      loadConfigFn: () => ({ contributor_id: 'c-1' }),
      now: new Date(2026, 7, 6),
    })).toBe(false)
    expect(spawnBriefSend).not.toHaveBeenCalled()
    expect(getBriefLog(db, '2026-W32')).toBeUndefined()
    db.close()
  })

  it('never throws, even when config loading explodes', () => {
    const db = initDb()
    expect(maybeScheduleWeeklyBrief(db, {
      loadConfigFn: () => { throw new Error('corrupt config') },
    })).toBe(false)
    db.close()
  })
})

describe('maybeBuildNudge — once per calendar day', () => {
  it('nudges with the top headline once, then stays quiet for the day', () => {
    const db = initDb()
    seedFiringDb(db)
    const now = new Date('2026-08-06T15:00:00Z')

    const first = maybeBuildNudge(db, { now })
    expect(first).toMatch(/^🐝 pollen: /)
    expect(first).toContain('pollen brief')
    expect(getBriefKv(db, 'last_nudge_day')).toBe('2026-08-06')

    expect(maybeBuildNudge(db, { now })).toBeNull()
    db.close()
  })

  it('nudges again the next day', () => {
    const db = initDb()
    seedFiringDb(db)
    expect(maybeBuildNudge(db, { now: new Date('2026-08-06T15:00:00Z') })).not.toBeNull()
    expect(maybeBuildNudge(db, { now: new Date('2026-08-07T15:00:00Z') })).not.toBeNull()
    db.close()
  })

  it('returns null when no rules fire (empty database)', () => {
    const db = initDb()
    expect(maybeBuildNudge(db, { now: new Date('2026-08-06T15:00:00Z') })).toBeNull()
    // and does NOT burn the daily slot
    expect(getBriefKv(db, 'last_nudge_day')).toBeNull()
    db.close()
  })
})

describe('handleSessionStart integration', () => {
  it('still records the session and never throws with brief automation wired in', () => {
    const db = initDb()
    const output = handleSessionStart(db, {
      session_id: 'sess-1',
      hook_event_name: 'SessionStart',
      model: 'claude-sonnet-4-6',
    })
    const row = db.prepare('SELECT session_id FROM sessions WHERE session_id = ?').get('sess-1')
    expect(row).toBeDefined()
    // systemMessage is optional — shape only matters when present
    if (output?.systemMessage) {
      expect(typeof output.systemMessage).toBe('string')
    }
    db.close()
  })

  it('codex sessions never get a nudge', () => {
    const db = initDb()
    seedFiringDb(db)
    const output = handleSessionStart(db, {
      session_id: 'codex-1',
      hook_event_name: 'SessionStart',
    }, 'codex')
    expect(output?.systemMessage).toBeUndefined()
    db.close()
  })
})
