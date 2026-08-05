import { describe, expect, it, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { finalizeStaleSessions, IDLE_FINALIZE_MS } from './finalize.js'
import { getSession, initDb, insertContribution, insertSession, insertToolEvent } from './store.js'
import type { Contribution, CoarsenedToolEvent, SessionRecord } from './types.js'

const HOUR = 60 * 60 * 1000

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    session_id: 'stale-1',
    model: 'claude-sonnet-4-6',
    source: 'claude-code',
    started_at: Date.now() - 3 * HOUR,
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
    contributor_id: 'contributor-test',
    permission_mode: null,
    ...overrides,
  } as SessionRecord
}

function makeToolEvent(overrides: Partial<CoarsenedToolEvent> = {}): CoarsenedToolEvent {
  return {
    id: crypto.randomUUID(),
    session_id: 'stale-1',
    timestamp: Date.now() - 2.5 * HOUR,
    tool_name: 'Read',
    tool_category: 'read',
    success: true,
    error_category: null,
    file_extension: null,
    command_category: null,
    sequence_number: 1,
    mcp_server: null,
    duration_ms: null,
    contributor_id: 'contributor-test',
    ...overrides,
  } as CoarsenedToolEvent
}

describe('finalizeStaleSessions', () => {
  let db: Database.Database

  beforeEach(() => {
    db = initDb()
  })

  it('finalizes an idle unfinished session as of its last activity', () => {
    const lastActivity = Date.now() - 2.5 * HOUR
    insertSession(db, makeSession())
    insertToolEvent(db, makeToolEvent({ timestamp: lastActivity }))

    const n = finalizeStaleSessions(db)

    expect(n).toBe(1)
    const session = getSession(db, 'stale-1')!
    expect(session.ended_at).toBe(lastActivity)
    expect(session.end_reason).toBe('idle_finalized')
    expect(session.outcome).not.toBeNull()
    expect(session.satisfaction_score).not.toBeNull()
  })

  it('leaves recently active sessions alone', () => {
    insertSession(db, makeSession({ session_id: 'active-1', started_at: Date.now() - 3 * HOUR }))
    insertToolEvent(db, makeToolEvent({ session_id: 'active-1', timestamp: Date.now() - 10 * 60 * 1000 }))

    expect(finalizeStaleSessions(db)).toBe(0)
    expect(getSession(db, 'active-1')!.ended_at).toBeNull()
  })

  it('never touches the currently starting session', () => {
    insertSession(db, makeSession({ session_id: 'current-1' }))

    expect(finalizeStaleSessions(db, { excludeSessionId: 'current-1' })).toBe(0)
    expect(getSession(db, 'current-1')!.ended_at).toBeNull()
  })

  it('skips sessions that already ended', () => {
    insertSession(db, makeSession({ session_id: 'done-1', ended_at: Date.now() - HOUR }))

    expect(finalizeStaleSessions(db)).toBe(0)
  })

  it('classifies a one-prompt no-tool stale session as abandoned', () => {
    insertSession(db, makeSession({ session_id: 'thin-1' }))
    const contribution: Contribution = {
      id: crypto.randomUUID(),
      timestamp: Date.now() - 2.5 * HOUR,
      session_id: 'thin-1',
      features: {
        keywords: [], tools_chain: [], language_signals: [], frameworks: [],
        prompt_length: 'short', code_ratio: 'none', structure_type: 'question',
        session_depth: 'first', has_error_trace: false, has_code_block: false,
        day_of_week: 'monday', hour_bucket: 'morning',
      },
      labels: {
        intent: 'exploration', complexity: 'simple',
        prompt_style: 'minimal', domain: 'general', taxonomy_version: 'v1', confidence: 0.5,
      },
      action: null,
      topic: null,
      contributor_id: 'contributor-test',
      permission_mode: null,
    }
    insertContribution(db, contribution)

    expect(finalizeStaleSessions(db)).toBe(1)
    expect(getSession(db, 'thin-1')!.outcome).toBe('abandoned')
  })

  it('honors a custom now for the idle window boundary', () => {
    const started = Date.now() - 3 * HOUR
    insertSession(db, makeSession({ session_id: 'edge-1', started_at: started }))

    // exactly at the boundary → not yet stale
    expect(finalizeStaleSessions(db, { now: started + IDLE_FINALIZE_MS })).toBe(0)
    // one ms past → finalized
    expect(finalizeStaleSessions(db, { now: started + IDLE_FINALIZE_MS + 1 })).toBe(1)
  })
})
