import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { computeDurationBucket, computeOutcome, computeSessionArc, computeSatisfactionScore } from './session-arc.js'
import { initDb, insertContribution, insertToolEvent, insertSession } from './store.js'
import type Database from 'better-sqlite3'
import type { Contribution, CoarsenedToolEvent } from './types.js'

describe('computeDurationBucket', () => {
  it('classifies quick sessions (< 5 min)', () => {
    const start = Date.now()
    expect(computeDurationBucket(start, start + 2 * 60000)).toBe('quick')
  })

  it('classifies short sessions (5-15 min)', () => {
    const start = Date.now()
    expect(computeDurationBucket(start, start + 10 * 60000)).toBe('short')
  })

  it('classifies medium sessions (15-60 min)', () => {
    const start = Date.now()
    expect(computeDurationBucket(start, start + 30 * 60000)).toBe('medium')
  })

  it('classifies long sessions (1-3 hours)', () => {
    const start = Date.now()
    expect(computeDurationBucket(start, start + 120 * 60000)).toBe('long')
  })

  it('classifies marathon sessions (3+ hours)', () => {
    const start = Date.now()
    expect(computeDurationBucket(start, start + 200 * 60000)).toBe('marathon')
  })
})

describe('computeOutcome', () => {
  it('returns error_exit when >50% tool failures', () => {
    expect(computeOutcome(6, 10, 5)).toBe('error_exit')
  })

  it('returns abandoned for single-prompt no-tool sessions', () => {
    expect(computeOutcome(0, 0, 1)).toBe('abandoned')
  })

  it('returns completed for normal sessions', () => {
    expect(computeOutcome(1, 10, 5)).toBe('completed')
  })
})

describe('computeSessionArc', () => {
  let db: Database.Database

  beforeEach(() => {
    db = initDb()
  })

  afterEach(() => {
    db.close()
  })

  it('aggregates a complete session arc', () => {
    const sessionId = 'arc-test'
    const startedAt = Date.now() - 30 * 60000 // 30 min ago

    // Add contributions
    insertContribution(db, {
      id: 'c1',
      timestamp: startedAt + 1000,
      session_id: sessionId,
      features: {
        keywords: ['fix'], tools_chain: ['Read'], language_signals: ['typescript'],
        frameworks: [], prompt_length: 'short', code_ratio: 'none',
        structure_type: 'imperative', session_depth: 'first',
        has_error_trace: false, has_code_block: false,
        day_of_week: 'monday', hour_bucket: 'morning',
      },
      labels: {
        intent: 'debugging', complexity: 'simple', prompt_style: 'directive',
        domain: 'web_frontend', taxonomy_version: 'v1.0', confidence: 0.9,
      },
      action: 'fix', topic: 'errors',
    })

    insertContribution(db, {
      id: 'c2',
      timestamp: startedAt + 5000,
      session_id: sessionId,
      features: {
        keywords: ['add'], tools_chain: ['Edit'], language_signals: ['typescript'],
        frameworks: ['react'], prompt_length: 'medium', code_ratio: 'low',
        structure_type: 'imperative', session_depth: 'early',
        has_error_trace: false, has_code_block: false,
        day_of_week: 'monday', hour_bucket: 'morning',
      },
      labels: {
        intent: 'feature_build', complexity: 'moderate', prompt_style: 'directive',
        domain: 'web_frontend', taxonomy_version: 'v1.0', confidence: 0.85,
      },
      action: 'create', topic: 'ui',
    })

    // Add tool events
    insertToolEvent(db, {
      id: 't1', session_id: sessionId, timestamp: startedAt + 2000,
      tool_name: 'Read', tool_category: 'read', success: true,
      error_category: null, file_extension: '.ts', command_category: null, sequence_number: 0,
      mcp_server: null, duration_ms: null,
    })
    insertToolEvent(db, {
      id: 't2', session_id: sessionId, timestamp: startedAt + 3000,
      tool_name: 'Edit', tool_category: 'write', success: true,
      error_category: null, file_extension: '.ts', command_category: null, sequence_number: 1,
      mcp_server: null, duration_ms: null,
    })
    insertToolEvent(db, {
      id: 't3', session_id: sessionId, timestamp: startedAt + 4000,
      tool_name: 'Bash', tool_category: 'execute', success: false,
      error_category: 'runtime', file_extension: null, command_category: 'test', sequence_number: 2,
      mcp_server: null, duration_ms: null,
    })

    const endedAt = Date.now()
    const arc = computeSessionArc(db, sessionId, startedAt, endedAt)

    expect(arc.duration_bucket).toBe('medium')
    expect(arc.prompt_count).toBe(2)
    expect(arc.tool_use_count).toBe(3)
    expect(arc.tool_failure_count).toBe(1)
    expect(arc.dominant_intent).toBe('debugging') // tie broken by first-seen order
    expect(arc.dominant_domain).toBe('web_frontend')
    expect(JSON.parse(arc.unique_tools)).toContain('Read')
    expect(JSON.parse(arc.unique_tools)).toContain('Edit')
    expect(JSON.parse(arc.unique_tools)).toContain('Bash')
    expect(JSON.parse(arc.languages_used)).toContain('typescript')
    expect(arc.outcome).toBe('completed')

    // Satisfaction score should be computed
    expect(arc.satisfaction_score).toBeGreaterThan(0)
    const signals = JSON.parse(arc.satisfaction_signals)
    expect(signals.tool_engagement).toBe(true)
    expect(signals.clean_ending).toBe(true)
  })

  it('handles empty session', () => {
    const start = Date.now() - 60000
    const arc = computeSessionArc(db, 'empty-session', start, Date.now())

    expect(arc.prompt_count).toBe(0)
    expect(arc.tool_use_count).toBe(0)
    expect(arc.dominant_intent).toBeNull()
    expect(arc.outcome).toBe('abandoned')
  })
})
