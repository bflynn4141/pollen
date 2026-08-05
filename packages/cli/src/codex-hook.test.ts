import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { initDb } from './store.js'
import { detectCodexToolError, handleCodexPostToolUse } from './codex-hook.js'

interface ToolEventRow {
  tool_name: string
  success: number
  error_category: string | null
  response_type: string | null
}

function toolEvents(db: Database.Database, sessionId: string): ToolEventRow[] {
  return db.prepare(
    'SELECT tool_name, success, error_category, response_type FROM tool_events WHERE session_id = ? ORDER BY sequence_number'
  ).all(sessionId) as ToolEventRow[]
}

describe('detectCodexToolError', () => {
  it('returns null for a plain successful response', () => {
    expect(detectCodexToolError({ tool_response: 'all good' })).toBeNull()
    expect(detectCodexToolError({})).toBeNull()
    expect(detectCodexToolError({ tool_response: { output: 'done', success: true } })).toBeNull()
  })

  it('detects top-level error field', () => {
    expect(detectCodexToolError({ error: 'ENOENT: no such file' })).toBe('ENOENT: no such file')
  })

  it('detects is_error flag in structured tool_response', () => {
    expect(detectCodexToolError({ tool_response: { is_error: true, output: 'command failed with exit 1' } }))
      .toBe('command failed with exit 1')
  })

  it('detects isError camelCase variant', () => {
    expect(detectCodexToolError({ tool_response: { isError: true } })).toBe('tool_error')
  })

  it('detects error field inside tool_response', () => {
    expect(detectCodexToolError({ tool_response: { error: 'permission denied' } })).toBe('permission denied')
    expect(detectCodexToolError({ tool_response: { error: { message: 'timed out' } } })).toBe('timed out')
  })

  it('detects success:false', () => {
    expect(detectCodexToolError({ tool_response: { success: false, text: 'build failed' } })).toBe('build failed')
  })
})

describe('handleCodexPostToolUse', () => {
  let db: Database.Database
  const SID = 'codex-route-test'

  beforeEach(() => {
    db = initDb()
  })

  afterEach(() => {
    db.close()
  })

  it('routes errored PostToolUse to the failure handler', () => {
    handleCodexPostToolUse(db, {
      session_id: SID,
      hook_event_name: 'PostToolUse',
      tool_name: 'exec',
      tool_response: { is_error: true, output: 'ENOENT: no such file or directory' },
    })

    const [row] = toolEvents(db, SID)
    expect(row.success).toBe(0)
    expect(row.error_category).toBe('not_found')
    expect(row.response_type).toBe('error_output')
  })

  it('routes successful PostToolUse to the normal handler', () => {
    handleCodexPostToolUse(db, {
      session_id: SID,
      hook_event_name: 'PostToolUse',
      tool_name: 'exec',
      tool_response: { output: 'Script completed', success: true },
    })

    const [row] = toolEvents(db, SID)
    expect(row.success).toBe(1)
    expect(row.error_category).toBeNull()
  })

  it('handles string tool_response without misrouting', () => {
    handleCodexPostToolUse(db, {
      session_id: SID,
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_response: 'file contents here',
    })

    const [row] = toolEvents(db, SID)
    expect(row.success).toBe(1)
  })
})
