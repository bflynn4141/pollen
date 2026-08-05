/**
 * Codex adapter for live hooks.
 *
 * Codex cloned Claude Code's hook contract (same event names, JSON on stdin,
 * ~/.codex/hooks.json in Claude settings format) but has NO PostToolUseFailure
 * event — tool failures arrive as PostToolUse with error info embedded in the
 * payload / tool_response. In Codex mode (`--source codex` argv flag on the
 * registered hook command) we inspect PostToolUse payloads and route failures
 * to the failure handler.
 */
import type Database from 'better-sqlite3'
import { handlePostToolUse } from './hooks/tool-use.js'
import { handlePostToolUseFailure } from './hooks/tool-failure.js'
import type { HookInput } from './types.js'

/**
 * Detect an error in a Codex PostToolUse payload.
 * Returns the error text when the tool call failed, or null on success.
 * Defensive: tool_response may be a string, an object with error/is_error
 * flags, or absent entirely.
 */
export function detectCodexToolError(input: HookInput): string | null {
  // Top-level error field (mirrors Claude Code's PostToolUseFailure shape)
  if (typeof input.error === 'string' && input.error.length > 0) return input.error
  if (typeof input.tool_error === 'string' && input.tool_error.length > 0) return input.tool_error

  const resp = input.tool_response
  if (resp == null || typeof resp === 'string') return null

  // Object response: look for explicit failure flags
  const isError = resp.is_error ?? resp.isError
  const errField = resp.error
  const success = resp.success

  if (isError === true || success === false || errField != null) {
    if (typeof errField === 'string' && errField.length > 0) return errField
    if (errField != null && typeof errField === 'object') {
      const msg = (errField as Record<string, unknown>).message
      if (typeof msg === 'string' && msg.length > 0) return msg
    }
    // Flag set but no message — use output text if present, else generic
    const output = resp.output ?? resp.text ?? resp.content
    if (typeof output === 'string' && output.length > 0) return output.slice(0, 500)
    return 'tool_error'
  }

  return null
}

/**
 * Codex PostToolUse: route to the failure handler when the payload carries an
 * error (Codex has no PostToolUseFailure event), else the normal handler.
 */
export function handleCodexPostToolUse(db: Database.Database, input: HookInput): void {
  const error = detectCodexToolError(input)
  if (error !== null) {
    handlePostToolUseFailure(db, { ...input, error })
    return
  }
  handlePostToolUse(db, input)
}
