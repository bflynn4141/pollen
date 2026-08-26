import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { initDb, getSession } from './store.js'
import { backfillCodex, finalizeRecentCodexSessions } from './codex-backfill.js'
import { buildNetworkReceipts } from './network-receipt.js'
import { handlePostToolUse } from './hooks/tool-use.js'
import { handleSessionStart } from './hooks/session-start.js'

// Fixture grounded in the REAL local rollout schema (~/.codex/sessions/2026/08,
// cli_version 0.146.0-alpha.9.2). All values synthesized/redacted.
const SESSION_ID = '01900000-aaaa-7000-8000-000000000001'

function line(timestamp: string, type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ timestamp, type, payload })
}

function fixtureLines(): string[] {
  return [
    line('2026-08-01T14:00:41.144Z', 'session_meta', {
      session_id: SESSION_ID,
      id: SESSION_ID,
      timestamp: '2026-08-01T14:00:40.737Z',
      cwd: '/tmp/fixture-project',
      originator: 'Codex Desktop',
      cli_version: '0.146.0-alpha.9.2',
      source: 'vscode',
      model_provider: 'openai',
    }),
    line('2026-08-01T14:00:42.000Z', 'turn_context', {
      turn_id: '01900000-aaaa-7000-8000-00000000t001',
      cwd: '/tmp/fixture-project',
      model: 'gpt-5.6-sol',
      effort: 'medium',
    }),
    // Codex can prepend app/AGENTS context as separate user-role parts. Only
    // the actual user-authored part should feed Pollen's shared classifier.
    line('2026-08-01T14:00:44.000Z', 'response_item', {
      type: 'message',
      id: 'msg_prompt_0001',
      role: 'user',
      content: [
        { type: 'input_text', text: '<recommended_plugins>SECRET injected context</recommended_plugins>' },
        { type: 'input_text', text: '# AGENTS.md instructions\nSECRET workspace policy' },
        { type: 'input_text', text: 'fix the failing API test without storing this raw prompt' },
      ],
    }),
    // unknown event_msg subtype — must be ignored
    line('2026-08-01T14:00:43.000Z', 'event_msg', {
      type: 'task_started', turn_id: 't1', model_context_window: 258400,
    }),
    // tool call 1: success
    line('2026-08-01T14:01:00.907Z', 'response_item', {
      type: 'custom_tool_call',
      id: 'ctc_0001',
      status: 'completed',
      call_id: 'call_success01',
      name: 'exec',
      input: 'const r = await tools.exec_command({cmd:"ls"})',
    }),
    line('2026-08-01T14:01:01.002Z', 'event_msg', {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 1000, cached_input_tokens: 400,
          cache_write_input_tokens: 0, output_tokens: 50,
          reasoning_output_tokens: 8, total_tokens: 1050,
        },
        last_token_usage: { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 50, reasoning_output_tokens: 8 },
        model_context_window: 258400,
      },
    }),
    line('2026-08-01T14:01:02.500Z', 'response_item', {
      type: 'custom_tool_call_output',
      id: 'ctco_0001',
      call_id: 'call_success01',
      output: [
        { type: 'input_text', text: 'Script completed\nWall time 0.1 seconds\nOutput:\n' },
        { type: 'input_text', text: 'README.md\nsrc\n' },
      ],
    }),
    // tool call 2: failure (real-world shape: error text inside output)
    line('2026-08-01T14:01:10.000Z', 'response_item', {
      type: 'custom_tool_call',
      id: 'ctc_0002',
      call_id: 'call_failure02',
      name: 'exec',
      input: 'const r = await tools.exec_command({cmd:"sed -n 1p /missing"})',
    }),
    line('2026-08-01T14:01:11.000Z', 'response_item', {
      type: 'custom_tool_call_output',
      id: 'ctco_0002',
      call_id: 'call_failure02',
      output: [
        { type: 'input_text', text: 'Script completed\nOutput:\n' },
        { type: 'input_text', text: 'sed: /missing: No such file or directory\n' },
      ],
    }),
    // MCP tool call with explicit isError
    line('2026-08-01T14:01:20.000Z', 'event_msg', {
      type: 'mcp_tool_call_end',
      call_id: 'exec-mcp-0003',
      invocation: { server: 'node_repl', tool: 'js', arguments: { code: 'redacted' } },
      duration: { secs: 2, nanos: 500000000 },
      result: { Ok: { content: [{ type: 'text', text: 'server error -10005' }], isError: true } },
    }),
    // ignored types
    line('2026-08-01T14:01:25.000Z', 'response_item', { type: 'reasoning', id: 'rs_1', encrypted_content: 'xxxx' }),
    line('2026-08-01T14:01:26.000Z', 'world_state', { full: false, state: {} }),
    'this is not json at all {{{',
    // output without a recorded call — must be skipped, not crash
    line('2026-08-01T14:01:27.000Z', 'response_item', {
      type: 'custom_tool_call_output', call_id: 'call_orphan', output: 'orphan',
    }),
    // final cumulative token snapshot — latest wins
    line('2026-08-01T14:05:00.000Z', 'event_msg', {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 5000, cached_input_tokens: 2000,
          cache_write_input_tokens: 0, output_tokens: 300,
          reasoning_output_tokens: 40, total_tokens: 5300,
        },
      },
    }),
    line('2026-08-01T14:05:01.000Z', 'event_msg', {
      type: 'task_complete', turn_id: 't1', last_agent_message: 'redacted', duration_ms: 1234,
    }),
  ]
}

describe('backfillCodex', () => {
  let db: Database.Database
  let dir: string
  let sessionsDir: string
  const NOW = Date.parse('2026-08-05T00:00:00Z')

  beforeEach(() => {
    db = initDb()
    dir = mkdtempSync(join(tmpdir(), 'pollen-codex-backfill-'))
    sessionsDir = join(dir, 'sessions')
    mkdirSync(join(sessionsDir, '2026', '08', '01'), { recursive: true })
    writeFileSync(
      join(sessionsDir, '2026', '08', '01', `rollout-2026-08-01T07-00-40-${SESSION_ID}.jsonl`),
      fixtureLines().join('\n') + '\n',
    )
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('ingests a session with tool events, tokens, and metadata', async () => {
    const result = await backfillCodex(db, { sessionsDir, days: 30, now: NOW })

    expect(result.files).toBe(1)
    expect(result.sessions).toBe(1)
    expect(result.toolEvents).toBe(3)
    expect(result.skippedFiles).toBe(0)
    expect(result.warnings).toEqual([])

    const session = getSession(db, SESSION_ID)!
    expect(session).toBeDefined()
    expect(session.source).toBe('codex')
    expect(session.model).toBe('gpt-5.6-sol')
    expect(session.started_at).toBe(Date.parse('2026-08-01T14:00:40.737Z'))
    expect(session.ended_at).toBe(Date.parse('2026-08-01T14:05:01.000Z'))
    expect(session.end_reason).toBe('codex_backfill')
    expect(session.prompt_count).toBe(1)
    expect(session.dominant_intent).toBe('debugging')
    expect(session.tool_use_count).toBe(3)
    expect(session.tool_failure_count).toBe(2)

    // Token totals: cumulative snapshot — latest wins, not summed
    expect(session.input_tokens).toBe(5000)
    expect(session.output_tokens).toBe(300)
    expect(session.cached_input_tokens).toBe(2000)
    expect(session.reasoning_tokens).toBe(40)

    // cli_version recorded as a lifecycle event
    const meta = db.prepare(
      "SELECT metadata FROM lifecycle_events WHERE session_id = ? AND event_type = 'codex_session_meta'"
    ).get(SESSION_ID) as { metadata: string }
    expect(JSON.parse(meta.metadata).cli_version).toBe('0.146.0-alpha.9.2')

    const contributions = db.prepare('SELECT * FROM contributions WHERE session_id = ?')
      .all(SESSION_ID) as Array<Record<string, unknown>>
    expect(contributions).toHaveLength(1)
    expect(contributions[0].action).toBe('fix')
    expect(contributions[0].topic).toBe('api')
    expect(JSON.stringify(contributions)).not.toContain('SECRET')
    expect(JSON.stringify(contributions)).not.toContain('without storing this raw prompt')

    const receipts = buildNetworkReceipts(db, 'contributor-test')
    expect(receipts).toHaveLength(1)
    expect(receipts[0]).toMatchObject({
      intent: 'debugging',
      agent: 'codex',
      model: 'gpt-5.6-sol',
      tool_category_sequence: ['execute', 'execute', 'interact'],
      terminal_state: 'error_exit',
    })
  })

  it('maps tool call pairs and mcp_tool_call_end correctly', async () => {
    await backfillCodex(db, { sessionsDir, days: 30, now: NOW })

    const rows = db.prepare(
      `SELECT tool_name, success, error_category, mcp_server, sequence_number, duration_ms,
              attributed_input_tokens, attributed_output_tokens,
              attributed_cached_input_tokens, attributed_reasoning_tokens
       FROM tool_events WHERE session_id = ? ORDER BY sequence_number`
    ).all(SESSION_ID) as Array<{ tool_name: string; success: number; error_category: string | null; mcp_server: string | null; sequence_number: number; duration_ms: number | null }>

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      attributed_input_tokens: 1000,
      attributed_output_tokens: 50,
      attributed_cached_input_tokens: 400,
      attributed_reasoning_tokens: 8,
    })

    // Pair 1: clean exec output → success
    expect(rows[0].tool_name).toBe('exec')
    expect(rows[0].success).toBe(1)
    expect(rows[0].error_category).toBeNull()

    // Pair 2: "No such file or directory" in output → failure
    expect(rows[1].tool_name).toBe('exec')
    expect(rows[1].success).toBe(0)
    expect(rows[1].error_category).toBe('not_found')

    // MCP call: synthesized mcp__ name so extractMcpServer/coarsen helpers apply
    expect(rows[2].tool_name).toBe('mcp__node_repl__js')
    expect(rows[2].mcp_server).toBe('node_repl')
    expect(rows[2].success).toBe(0)
    expect(rows[2].duration_ms).toBe(2500)

    expect(rows.map(r => r.sequence_number)).toEqual([0, 1, 2])
  })

  it('normalizes legacy event_msg user messages through the shared classifier', async () => {
    const sid = '01900000-cccc-7000-8000-000000000003'
    mkdirSync(join(sessionsDir, '2026', '08', '02'), { recursive: true })
    writeFileSync(join(sessionsDir, '2026', '08', '02', 'rollout-legacy-user-message.jsonl'), [
      line('2026-08-02T11:00:00.000Z', 'session_meta', {
        session_id: sid,
        timestamp: '2026-08-02T11:00:00.000Z',
        cwd: '/tmp/api-project',
        cli_version: '0.100.0',
      }),
      line('2026-08-02T11:00:01.000Z', 'turn_context', { model: 'gpt-5-codex' }),
      line('2026-08-02T11:00:02.000Z', 'event_msg', {
        type: 'user_message',
        message: 'debug the database migration SECRET legacy raw text',
        images: [],
        local_images: [],
        text_elements: [],
      }),
      line('2026-08-02T11:05:00.000Z', 'event_msg', { type: 'task_complete' }),
    ].join('\n'))

    await backfillCodex(db, { sessionsDir, days: 30, now: NOW })

    const session = getSession(db, sid)!
    expect(session.prompt_count).toBe(1)
    // Uses the same classifier as Claude; "migration" is a strong devops
    // signal in the shared taxonomy even though the action label is "fix".
    expect(session.dominant_intent).toBe('devops')
    const contribution = db.prepare('SELECT * FROM contributions WHERE session_id = ?')
      .get(sid) as Record<string, unknown>
    expect(contribution.action).toBe('fix')
    expect(contribution.topic).toBe('database')
    expect(JSON.stringify(contribution)).not.toContain('SECRET')
    expect(JSON.stringify(contribution)).not.toContain('legacy raw text')
  })

  it('is idempotent — re-running changes nothing', async () => {
    await backfillCodex(db, { sessionsDir, days: 30, now: NOW })
    const countBefore = (db.prepare('SELECT COUNT(*) as c FROM tool_events').get() as { c: number }).c

    await backfillCodex(db, { sessionsDir, days: 30, now: NOW })

    const countAfter = (db.prepare('SELECT COUNT(*) as c FROM tool_events').get() as { c: number }).c
    expect(countAfter).toBe(countBefore)
    const sessions = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }).c
    expect(sessions).toBe(1)
    const lifecycle = (db.prepare("SELECT COUNT(*) as c FROM lifecycle_events WHERE event_type = 'codex_session_meta'").get() as { c: number }).c
    expect(lifecycle).toBe(1)
  })

  it('automatically finalizes recent Codex tokens without duplicating live hook events', async () => {
    handleSessionStart(db, {
      session_id: SESSION_ID,
      hook_event_name: 'SessionStart',
      model: 'gpt-5.6-sol',
    }, 'codex')
    handlePostToolUse(db, {
      session_id: SESSION_ID,
      hook_event_name: 'PostToolUse',
      tool_name: 'exec',
      tool_use_id: 'call_success01',
      tool_response: 'README.md\nsrc',
    })
    db.prepare('UPDATE sessions SET ended_at = ?, end_reason = ? WHERE session_id = ?')
      .run(Date.parse('2026-08-01T14:05:02.000Z'), 'exit', SESSION_ID)

    const first = await finalizeRecentCodexSessions(db, {
      sessionsDir,
      now: NOW,
      lookbackDays: 10,
    })
    const second = await finalizeRecentCodexSessions(db, {
      sessionsDir,
      now: NOW + 1,
      lookbackDays: 10,
    })

    expect(first).toMatchObject({ checked: 1, finalized: 1, warnings: [] })
    expect(second).toMatchObject({ checked: 0, finalized: 0, warnings: [] })
    expect(getSession(db, SESSION_ID)).toMatchObject({
      input_tokens: 5000,
      output_tokens: 300,
      cached_input_tokens: 2000,
      reasoning_tokens: 40,
      end_reason: 'exit',
    })
    const tools = db.prepare(`
      SELECT tool_use_id, attributed_input_tokens
      FROM tool_events WHERE session_id = ? ORDER BY sequence_number
    `).all(SESSION_ID) as Array<{ tool_use_id: string; attributed_input_tokens: number | null }>
    expect(tools).toHaveLength(3)
    expect(tools.find(tool => tool.tool_use_id === 'call_success01')?.attributed_input_tokens).toBe(1000)
  })

  it('accumulates last_token_usage deltas when no cumulative snapshot exists', async () => {
    const sid = '01900000-bbbb-7000-8000-000000000002'
    mkdirSync(join(sessionsDir, '2026', '08', '02'), { recursive: true })
    writeFileSync(join(sessionsDir, '2026', '08', '02', 'rollout-2026-08-02T00-00-00-tokens.jsonl'), [
      line('2026-08-02T10:00:00.000Z', 'session_meta', { session_id: sid, timestamp: '2026-08-02T10:00:00.000Z', cwd: '/tmp', cli_version: '0.146.0' }),
      line('2026-08-02T10:00:01.000Z', 'event_msg', {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 10, output_tokens: 5 } },
      }),
      line('2026-08-02T10:00:02.000Z', 'event_msg', {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 200, cached_input_tokens: 40, output_tokens: 25 } },
      }),
    ].join('\n'))

    await backfillCodex(db, { sessionsDir, days: 30, now: NOW })

    const session = getSession(db, sid)!
    expect(session.input_tokens).toBe(300)
    expect(session.cached_input_tokens).toBe(50)
    expect(session.output_tokens).toBe(30)
  })

  it('tolerates files full of unknown types without creating sessions', async () => {
    mkdirSync(join(sessionsDir, '2026', '08', '03'), { recursive: true })
    writeFileSync(join(sessionsDir, '2026', '08', '03', 'rollout-2026-08-03T00-00-00-junk.jsonl'), [
      line('2026-08-03T10:00:00.000Z', 'mystery_type', { type: 'whatever', deeply: { nested: true } }),
      line('2026-08-03T10:00:01.000Z', 'event_msg', { type: 'brand_new_event', data: [1, 2, 3] }),
      '{"broken": ',
      '',
      'null',
      '42',
    ].join('\n'))

    const result = await backfillCodex(db, { sessionsDir, days: 30, now: NOW })
    // Both files parsed (fixture + junk), only fixture produced a session
    expect(result.files).toBe(2)
    expect(result.sessions).toBe(1)
  })

  it('respects the --days window', async () => {
    // Fixture is dated 2026-08-01; with now=2026-08-05 and days=2 it is out of range
    const result = await backfillCodex(db, { sessionsDir, days: 2, now: NOW })
    expect(result.files).toBe(0)
    expect(result.sessions).toBe(0)
    expect(getSession(db, SESSION_ID)).toBeUndefined()
  })

  it('warns and returns cleanly when the sessions dir does not exist', async () => {
    const result = await backfillCodex(db, { sessionsDir: join(dir, 'nope'), days: 30, now: NOW })
    expect(result.files).toBe(0)
    expect(result.warnings.length).toBe(1)
  })
})
