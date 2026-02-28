import type Database from 'better-sqlite3'
import { detectProjectType } from '../coarsen.js'
import { insertSession } from '../store.js'
import type { HookInput } from '../types.js'

export function handleSessionStart(db: Database.Database, input: HookInput): void {
  if (!input.session_id) return

  insertSession(db, {
    session_id: input.session_id,
    model: input.model ?? null,
    source: input.source ?? null,
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
  })
}
