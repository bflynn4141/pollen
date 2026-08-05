import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { initDb, getSession } from '../store.js'
import { computeOutcome } from '../session-arc.js'
import { handleSessionStart } from './session-start.js'
import { handleSessionEnd } from './session-end.js'
import { handlePostToolUse } from './tool-use.js'
import { handlePostToolUseFailure } from './tool-failure.js'
import { handleStop } from './stop.js'
import {
  coarsenStopFailureErrorType,
  handlePromptExpansion,
  handleStopFailure,
  handlePermissionRequest,
  handlePermissionDenied,
  handlePostCompact,
} from './capture-events.js'

interface LifecycleRow {
  session_id: string
  event_type: string
  metadata: string
}

function lifecycleEvents(db: Database.Database, sessionId: string): LifecycleRow[] {
  return db.prepare(
    'SELECT session_id, event_type, metadata FROM lifecycle_events WHERE session_id = ? ORDER BY timestamp'
  ).all(sessionId) as LifecycleRow[]
}

describe('v5 capture events', () => {
  let db: Database.Database
  const SID = 'capture-test'

  beforeEach(() => {
    db = initDb()
  })

  afterEach(() => {
    db.close()
  })

  describe('UserPromptExpansion', () => {
    it('stores command_name but never expanded_prompt', () => {
      handlePromptExpansion(db, {
        session_id: SID,
        hook_event_name: 'UserPromptExpansion',
        prompt_id: 'p-1',
        command_name: '/deploy',
        expanded_prompt: 'SECRET full prompt text that must not persist',
      })

      const [row] = lifecycleEvents(db, SID)
      expect(row.event_type).toBe('prompt_expansion')
      const meta = JSON.parse(row.metadata)
      expect(meta.command_name).toBe('/deploy')
      expect(row.metadata).not.toContain('SECRET')
      expect(Object.keys(meta)).toEqual(['command_name'])
    })

    it('no-ops without session_id', () => {
      handlePromptExpansion(db, { hook_event_name: 'UserPromptExpansion', command_name: '/x' })
      expect(lifecycleEvents(db, '')).toHaveLength(0)
    })
  })

  describe('StopFailure', () => {
    it('stores closed-vocab error_type and never error_message', () => {
      handleStopFailure(db, {
        session_id: SID,
        hook_event_name: 'StopFailure',
        error_type: 'rate_limit',
        error_message: 'Rate limited: retry after 60s (org acct-12345)',
      })

      const [row] = lifecycleEvents(db, SID)
      expect(row.event_type).toBe('stop_failure')
      expect(JSON.parse(row.metadata)).toEqual({ error_type: 'rate_limit' })
      expect(row.metadata).not.toContain('acct-12345')
    })

    it('coarsens out-of-vocab error types to unknown', () => {
      expect(coarsenStopFailureErrorType('rate_limit')).toBe('rate_limit')
      expect(coarsenStopFailureErrorType('max_output_tokens')).toBe('max_output_tokens')
      expect(coarsenStopFailureErrorType('something free text')).toBe('unknown')
      expect(coarsenStopFailureErrorType(undefined)).toBe('unknown')
    })

    it('prefers error_exit outcome when session ends on a stop_failure', () => {
      handleSessionStart(db, { session_id: SID, hook_event_name: 'SessionStart' })
      handlePostToolUse(db, { session_id: SID, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: '/a.ts' } })
      handleStopFailure(db, { session_id: SID, hook_event_name: 'StopFailure', error_type: 'server_error' })
      handleSessionEnd(db, { session_id: SID, hook_event_name: 'SessionEnd', reason: 'exit' })

      const session = getSession(db, SID)!
      expect(session.outcome).toBe('error_exit')
    })

    it('does not force error_exit when a later lifecycle event follows the stop_failure', () => {
      handleSessionStart(db, { session_id: SID, hook_event_name: 'SessionStart' })
      handlePostToolUse(db, { session_id: SID, hook_event_name: 'PostToolUse', tool_name: 'Read', tool_input: { file_path: '/a.ts' } })
      handleStopFailure(db, { session_id: SID, hook_event_name: 'StopFailure', error_type: 'overloaded' })
      // Recovery: a permission request happens after — timestamps are equal ms,
      // so bump via a second event with a later timestamp
      db.prepare('UPDATE lifecycle_events SET timestamp = timestamp - 1000 WHERE event_type = ?').run('stop_failure')
      handlePermissionRequest(db, { session_id: SID, hook_event_name: 'PermissionRequest', tool_name: 'Bash' })
      handleSessionEnd(db, { session_id: SID, hook_event_name: 'SessionEnd', reason: 'exit' })

      const session = getSession(db, SID)!
      expect(session.outcome).toBe('completed')
    })

    it('computeOutcome keeps its existing fallback behavior', () => {
      expect(computeOutcome(0, 5, 3)).toBe('completed')
      expect(computeOutcome(4, 5, 3)).toBe('error_exit')
      expect(computeOutcome(0, 0, 1)).toBe('abandoned')
      expect(computeOutcome(0, 5, 3, true)).toBe('error_exit')
    })
  })

  describe('PermissionRequest / PermissionDenied', () => {
    it('stores tool_name for permission_request', () => {
      handlePermissionRequest(db, { session_id: SID, hook_event_name: 'PermissionRequest', tool_name: 'Bash' })
      const [row] = lifecycleEvents(db, SID)
      expect(row.event_type).toBe('permission_request')
      expect(JSON.parse(row.metadata)).toEqual({ tool_name: 'Bash' })
    })

    it('coarsens denial_reason to 64 chars', () => {
      const longReason = 'x'.repeat(300)
      handlePermissionDenied(db, {
        session_id: SID,
        hook_event_name: 'PermissionDenied',
        tool_name: 'Write',
        denial_reason: longReason,
      })
      const [row] = lifecycleEvents(db, SID)
      expect(row.event_type).toBe('permission_denied')
      const meta = JSON.parse(row.metadata)
      expect(meta.tool_name).toBe('Write')
      expect(meta.denial_reason).toHaveLength(64)
    })
  })

  describe('PostCompact', () => {
    it('stores manual/auto compaction_trigger', () => {
      handlePostCompact(db, { session_id: SID, hook_event_name: 'PostCompact', compaction_trigger: 'auto' })
      const [row] = lifecycleEvents(db, SID)
      expect(row.event_type).toBe('post_compact')
      expect(JSON.parse(row.metadata)).toEqual({ compaction_trigger: 'auto' })
    })

    it('nulls out-of-vocab triggers and accepts trigger alias', () => {
      handlePostCompact(db, { session_id: SID, hook_event_name: 'PostCompact', trigger: 'manual' })
      handlePostCompact(db, { session_id: SID, hook_event_name: 'PostCompact', compaction_trigger: 'weird' })
      const rows = lifecycleEvents(db, SID)
      expect(JSON.parse(rows[0].metadata).compaction_trigger).toBe('manual')
      expect(JSON.parse(rows[1].metadata).compaction_trigger).toBeNull()
    })
  })

  describe('tool event capture fields', () => {
    interface ToolRow {
      tool_use_id: string | null
      agent_id: string | null
      agent_type: string | null
      effort_level: string | null
    }

    it('captures tool_use_id, agent attribution, and effort on PostToolUse', () => {
      handlePostToolUse(db, {
        session_id: SID,
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/a.ts' },
        tool_use_id: 'toolu_abc123',
        agent_id: 'agent-9',
        agent_type: 'Explore',
        effort: { level: 'high' },
      })

      const row = db.prepare('SELECT tool_use_id, agent_id, agent_type, effort_level FROM tool_events WHERE session_id = ?').get(SID) as ToolRow
      expect(row.tool_use_id).toBe('toolu_abc123')
      expect(row.agent_id).toBe('agent-9')
      expect(row.agent_type).toBe('Explore')
      expect(row.effort_level).toBe('high')
    })

    it('keeps plugin-scoped agent_type verbatim and rejects junk effort levels', () => {
      handlePostToolUseFailure(db, {
        session_id: SID,
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        error: 'ENOENT: no such file',
        tool_use_id: 'toolu_def',
        agent_type: 'codex:codex-rescue',
        effort: { level: 'ultra-mega' },
      })

      const row = db.prepare('SELECT tool_use_id, agent_type, effort_level, success FROM tool_events WHERE session_id = ?').get(SID) as ToolRow & { success: number }
      expect(row.agent_type).toBe('codex:codex-rescue')
      expect(row.effort_level).toBeNull()
      expect(row.tool_use_id).toBe('toolu_def')
      expect(row.success).toBe(0)
    })

    it('leaves capture fields null when absent (older Claude Code)', () => {
      handlePostToolUse(db, {
        session_id: SID,
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/a.ts' },
      })
      const row = db.prepare('SELECT tool_use_id, agent_id, agent_type, effort_level FROM tool_events WHERE session_id = ?').get(SID) as ToolRow
      expect(row.tool_use_id).toBeNull()
      expect(row.agent_id).toBeNull()
      expect(row.agent_type).toBeNull()
      expect(row.effort_level).toBeNull()
    })
  })

  describe('session capture fields', () => {
    it('stores transcript_path at SessionStart and backfills when absent', () => {
      handleSessionStart(db, { session_id: SID, hook_event_name: 'SessionStart', transcript_path: '/tmp/t1.jsonl' })
      expect(getSession(db, SID)!.transcript_path).toBe('/tmp/t1.jsonl')

      // Resume with a different path — first-write wins (only fills NULL)
      handleSessionStart(db, { session_id: SID, hook_event_name: 'SessionStart', transcript_path: '/tmp/t2.jsonl' })
      expect(getSession(db, SID)!.transcript_path).toBe('/tmp/t1.jsonl')
    })

    it('backfills transcript_path onto a pre-existing session without one', () => {
      handleSessionStart(db, { session_id: SID, hook_event_name: 'SessionStart' })
      expect(getSession(db, SID)!.transcript_path).toBeNull()

      handleSessionStart(db, { session_id: SID, hook_event_name: 'SessionStart', transcript_path: '/tmp/t3.jsonl' })
      expect(getSession(db, SID)!.transcript_path).toBe('/tmp/t3.jsonl')
    })

    it('stores tool_use_count from Stop (last one wins)', () => {
      handleSessionStart(db, { session_id: SID, hook_event_name: 'SessionStart' })
      handleStop(db, { session_id: SID, hook_event_name: 'Stop', tool_use_count: 4 })
      handleStop(db, { session_id: SID, hook_event_name: 'Stop', tool_use_count: 11 })
      expect(getSession(db, SID)!.stop_tool_use_count).toBe(11)
    })

    it('ignores non-numeric tool_use_count', () => {
      handleSessionStart(db, { session_id: SID, hook_event_name: 'SessionStart' })
      handleStop(db, { session_id: SID, hook_event_name: 'Stop', tool_use_count: 'lots' as unknown as number })
      expect(getSession(db, SID)!.stop_tool_use_count).toBeNull()
    })
  })
})
