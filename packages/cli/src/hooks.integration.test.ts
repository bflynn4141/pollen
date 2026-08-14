import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import {
  initDb,
  getSession,
  getToolEventCount,
  getSessionPromptCount,
  queryToolFrequency,
  queryToolPairs,
  queryToolFailures,
  querySessionSummaries,
} from './store.js'
import { handlePromptSubmit } from './hooks/prompt.js'
import { handlePostToolUse } from './hooks/tool-use.js'
import { handlePostToolUseFailure } from './hooks/tool-failure.js'
import { handleSessionStart } from './hooks/session-start.js'
import { handleSessionEnd } from './hooks/session-end.js'
import { handleStop } from './hooks/stop.js'

describe('hooks integration: full session lifecycle', () => {
  let db: Database.Database
  const SESSION_ID = 'integration-lifecycle'

  beforeEach(() => {
    db = initDb()
  })

  afterEach(() => {
    db.close()
  })

  it('SessionStart → prompts → tools → failures → SessionEnd', () => {
    // 1. SessionStart
    handleSessionStart(db, {
      session_id: SESSION_ID,
      hook_event_name: 'SessionStart',
      model: 'claude-sonnet-4-6',
      source: 'claude-code',
    })

    const session = getSession(db, SESSION_ID)
    expect(session).toBeDefined()
    expect(session!.model).toBe('claude-sonnet-4-6')
    expect(session!.ended_at).toBeNull()

    // 2. UserPromptSubmit (debugging prompt)
    handlePromptSubmit(db, {
      session_id: SESSION_ID,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'fix the TypeError in the login handler',
    })

    expect(getSessionPromptCount(db, SESSION_ID)).toBe(1)

    // 3. PostToolUse (Read a file)
    handlePostToolUse(db, {
      session_id: SESSION_ID,
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: '/src/auth/login.ts' },
    })

    expect(getToolEventCount(db, SESSION_ID)).toBe(1)

    // 4. PostToolUse (Edit the file)
    handlePostToolUse(db, {
      session_id: SESSION_ID,
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/src/auth/login.ts', old_string: 'foo', new_string: 'bar' },
    })

    expect(getToolEventCount(db, SESSION_ID)).toBe(2)

    // 5. PostToolUse (Run tests)
    handlePostToolUse(db, {
      session_id: SESSION_ID,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    })

    // 6. PostToolUseFailure (test failed)
    handlePostToolUseFailure(db, {
      session_id: SESSION_ID,
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      tool_error: 'FAIL src/auth/login.test.ts - 2 tests failed',
    })

    // 7. Another prompt
    handlePromptSubmit(db, {
      session_id: SESSION_ID,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'add a null check before accessing user.email',
    })

    expect(getSessionPromptCount(db, SESSION_ID)).toBe(2)

    // 8. More tool use
    handlePostToolUse(db, {
      session_id: SESSION_ID,
      hook_event_name: 'PostToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/src/auth/login.ts', old_string: 'a', new_string: 'b' },
    })

    handlePostToolUse(db, {
      session_id: SESSION_ID,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    })

    // 9. Stop (with response metadata)
    handleStop(db, {
      session_id: SESSION_ID,
      hook_event_name: 'Stop',
      last_assistant_message: 'I fixed the TypeError by adding a null check before accessing user.email. Here is the updated code:\n\n```ts\nif (user?.email) {\n  sendVerification(user.email)\n}\n```\n\nThe test should pass now.',
    })

    // 10. Another Stop (to test averaging)
    handleStop(db, {
      session_id: SESSION_ID,
      hook_event_name: 'Stop',
      last_assistant_message: 'Done.',
    })

    // 11. SessionEnd (with reason)
    handleSessionEnd(db, {
      session_id: SESSION_ID,
      hook_event_name: 'SessionEnd',
      reason: 'exit',
    })

    // Verify session was finalized
    const finalSession = getSession(db, SESSION_ID)!
    expect(finalSession.ended_at).not.toBeNull()
    expect(finalSession.prompt_count).toBe(2)
    expect(finalSession.tool_use_count).toBe(6) // 5 PostToolUse + 1 PostToolUseFailure
    expect(finalSession.tool_failure_count).toBe(1)
    expect(finalSession.dominant_intent).toBeTruthy()
    expect(finalSession.outcome).toBe('completed')
    expect(finalSession.duration_bucket).toBeTruthy()

    // Verify end_reason
    expect(finalSession.end_reason).toBe('exit')

    const outbox = db.prepare(
      'SELECT synced_at FROM network_receipt_outbox WHERE session_id = ?'
    ).get(SESSION_ID) as { synced_at: number | null } | undefined
    expect(outbox).toEqual({ synced_at: null })

    // Verify response stats
    expect(finalSession.response_count).toBe(2)
    expect(finalSession.avg_response_length).toBeGreaterThan(0)

    // Verify unique tools
    const tools = JSON.parse(finalSession.unique_tools!)
    expect(tools).toContain('Read')
    expect(tools).toContain('Edit')
    expect(tools).toContain('Bash')

    // Verify tool frequency queries work
    const freq = queryToolFrequency(db)
    expect(freq.length).toBeGreaterThan(0)
    const bashFreq = freq.find(f => f.tool_name === 'Bash')
    expect(bashFreq).toBeDefined()
    expect(bashFreq!.failure_count).toBe(1)

    // Verify tool pairs
    const pairs = queryToolPairs(db)
    expect(pairs.length).toBeGreaterThan(0)
    const readToEdit = pairs.find(p => p.tool_a === 'Read' && p.tool_b === 'Edit')
    expect(readToEdit).toBeDefined()

    // Verify tool failures
    const failures = queryToolFailures(db)
    expect(failures.length).toBe(1)
    expect(failures[0].tool_name).toBe('Bash')
    expect(failures[0].error_category).toBe('test_failure')

    // Verify session summaries
    const summaries = querySessionSummaries(db)
    expect(summaries).toHaveLength(1)
    expect(summaries[0].session_id).toBe(SESSION_ID)
  })

  it('handles SessionEnd without matching SessionStart gracefully', () => {
    handleSessionEnd(db, {
      session_id: 'unknown-session',
      hook_event_name: 'SessionEnd',
    })

    // Should not create or crash — just skip
    expect(getSession(db, 'unknown-session')).toBeUndefined()
  })

  it('handles missing session_id gracefully', () => {
    // These should all be no-ops, not crashes
    handlePostToolUse(db, { hook_event_name: 'PostToolUse', tool_name: 'Read' })
    handlePostToolUseFailure(db, { hook_event_name: 'PostToolUseFailure', tool_name: 'Bash' })
    handleSessionStart(db, { hook_event_name: 'SessionStart' })
    handleSessionEnd(db, { hook_event_name: 'SessionEnd' })

    expect(getToolEventCount(db, '')).toBe(0)
  })

  it('handles missing tool_name gracefully', () => {
    handlePostToolUse(db, { session_id: 'x', hook_event_name: 'PostToolUse' })
    handlePostToolUseFailure(db, { session_id: 'x', hook_event_name: 'PostToolUseFailure' })

    expect(getToolEventCount(db, 'x')).toBe(0)
  })

  it('reads error field correctly (not tool_error)', () => {
    handleSessionStart(db, { session_id: 'error-test', hook_event_name: 'SessionStart' })

    // Claude Code sends 'error', not 'tool_error'
    handlePostToolUseFailure(db, {
      session_id: 'error-test',
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      error: 'TypeError: Cannot read property "name" of undefined',
    })

    const failures = queryToolFailures(db)
    const bashFailure = failures.find(f => f.tool_name === 'Bash')
    expect(bashFailure).toBeDefined()
    expect(bashFailure!.error_category).toBe('runtime') // not 'unknown'
  })

  it('tracks MCP server usage across session', () => {
    const sid = 'mcp-test'
    handleSessionStart(db, { session_id: sid, hook_event_name: 'SessionStart' })

    handlePostToolUse(db, {
      session_id: sid,
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__clara__wallet_send',
    })

    handlePostToolUse(db, {
      session_id: sid,
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__herd__getWalletOverviewTool',
    })

    handlePostToolUse(db, {
      session_id: sid,
      hook_event_name: 'PostToolUse',
      tool_name: 'mcp__clara__wallet_status',
    })

    handleSessionEnd(db, { session_id: sid, hook_event_name: 'SessionEnd' })

    const session = getSession(db, sid)!
    const mcpServers = JSON.parse(session.mcp_servers_used!)
    expect(mcpServers).toContain('clara')
    expect(mcpServers).toContain('herd')
    expect(mcpServers).toHaveLength(2)
  })
})
