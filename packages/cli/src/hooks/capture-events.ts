/**
 * v5 capture-upgrade hooks (Claude Code v2.1.211):
 * UserPromptExpansion, StopFailure, PermissionRequest, PermissionDenied, PostCompact.
 *
 * All stored as lifecycle_events rows with coarsened metadata.
 * Privacy contract: expanded_prompt and error_message free text NEVER persist.
 */
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { getOrCreateContributorId } from '../config.js'
import { insertLifecycleEvent } from '../store.js'
import type { HookInput, StopFailureErrorType } from '../types.js'

// Closed vocab for StopFailure.error_type — anything else coarsens to 'unknown'
const STOP_FAILURE_ERROR_TYPES = new Set<string>([
  'rate_limit', 'overloaded', 'authentication_failed', 'oauth_org_not_allowed',
  'billing_error', 'invalid_request', 'model_not_found', 'server_error',
  'max_output_tokens', 'unknown',
])

export function coarsenStopFailureErrorType(errorType: string | undefined): StopFailureErrorType {
  if (typeof errorType === 'string' && STOP_FAILURE_ERROR_TYPES.has(errorType)) {
    return errorType as StopFailureErrorType
  }
  return 'unknown'
}

function record(db: Database.Database, input: HookInput, eventType: string, metadata: Record<string, unknown>): void {
  if (!input.session_id) return

  insertLifecycleEvent(db, {
    id: randomUUID(),
    session_id: input.session_id,
    timestamp: Date.now(),
    event_type: eventType,
    metadata: JSON.stringify(metadata),
    contributor_id: getOrCreateContributorId(),
  })
}

/** UserPromptExpansion — a slash command expanded into a prompt.
 *  Stores only the command name; expanded_prompt text never persists. */
export function handlePromptExpansion(db: Database.Database, input: HookInput): void {
  record(db, input, 'prompt_expansion', {
    command_name: input.command_name ?? null,
  })
}

/** StopFailure — turn ended on an API error. error_type is a closed vocab;
 *  error_message free text never persists. */
export function handleStopFailure(db: Database.Database, input: HookInput): void {
  record(db, input, 'stop_failure', {
    error_type: coarsenStopFailureErrorType(input.error_type),
  })
}

/** PermissionRequest — a tool asked for permission. */
export function handlePermissionRequest(db: Database.Database, input: HookInput): void {
  record(db, input, 'permission_request', {
    tool_name: input.tool_name ?? null,
  })
}

/** PermissionDenied — the user (or a rule) denied a tool. denial_reason is
 *  coarsened to <=64 chars. */
export function handlePermissionDenied(db: Database.Database, input: HookInput): void {
  record(db, input, 'permission_denied', {
    tool_name: input.tool_name ?? null,
    denial_reason: typeof input.denial_reason === 'string'
      ? input.denial_reason.slice(0, 64)
      : null,
  })
}

/** PostCompact — context compaction finished. Trigger vocab: manual|auto. */
export function handlePostCompact(db: Database.Database, input: HookInput): void {
  const trigger = input.compaction_trigger ?? input.trigger
  record(db, input, 'post_compact', {
    compaction_trigger: trigger === 'manual' || trigger === 'auto' ? trigger : null,
  })
}
