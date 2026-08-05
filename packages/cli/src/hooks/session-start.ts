import type Database from 'better-sqlite3'
import { detectProjectType } from '../coarsen.js'
import { getOrCreateContributorId } from '../config.js'
import { finalizeStaleSessions } from '../finalize.js'
import { insertSession } from '../store.js'
import type { HookInput } from '../types.js'

export function handleSessionStart(
  db: Database.Database,
  input: HookInput,
  toolSource: string = 'claude-code',
): void {
  if (!input.session_id) return

  // Opportunistically close out sessions that never got a SessionEnd
  // (killed terminal, crash) so outcomes materialize without one.
  finalizeStaleSessions(db, { excludeSessionId: input.session_id })

  // `source` is the agent CLI identity (claude-code | codex); the hook
  // payload's own `source` field is the start TRIGGER (startup | clear |
  // resume | compact) and goes to start_source.
  insertSession(db, {
    session_id: input.session_id,
    model: input.model ?? null,
    source: toolSource,
    start_source: input.source ?? null,
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
    project_type: detectProjectType(input.cwd),
    end_reason: null,
    mcp_servers_used: null,
    response_count: 0,
    avg_response_length: 0,
    satisfaction_score: null,
    satisfaction_signals: null,
    subject: null,
    contributor_id: getOrCreateContributorId(),
    permission_mode: input.permission_mode ?? null,
    transcript_path: input.transcript_path ?? null,
  })

  // Session row may already exist (resume, or insert above was a no-op via
  // OR IGNORE) — backfill transcript_path only when absent.
  if (input.transcript_path) {
    db.prepare(
      'UPDATE sessions SET transcript_path = ? WHERE session_id = ? AND transcript_path IS NULL'
    ).run(input.transcript_path, input.session_id)
  }
}
