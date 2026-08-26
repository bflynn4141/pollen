import { describe, expect, it } from 'vitest'
import { initDb } from './store.js'
import { buildNetworkReceipts, summarizeNetworkReceipts } from './network-receipt.js'

describe('network receipts', () => {
  it('builds the closed privacy schema without raw local fields', () => {
    const db = initDb()
    db.prepare(`
      INSERT INTO sessions (
        session_id, model, source, started_at, ended_at, duration_bucket,
        prompt_count, tool_use_count, tool_failure_count, dominant_intent,
        outcome, transcript_path, subject, input_tokens, output_tokens,
        cached_input_tokens, reasoning_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'raw-local-session-id', 'gpt-5.2-codex', 'codex', 1_786_512_000_000,
      1_786_512_600_000, 'short', 3, 2, 0, 'feature_build', 'completed',
      '/Users/someone/secret/transcript.jsonl', 'Private project name',
      12_000, 800, 9_000, 250,
    )
    db.prepare(`
      INSERT INTO tool_events (
        id, session_id, timestamp, tool_name, tool_category, success,
        command_category, sequence_number, response_summary,
        attributed_input_tokens, attributed_output_tokens,
        attributed_cached_input_tokens, attributed_reasoning_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('tool-1', 'raw-local-session-id', 1_786_512_100_000, 'Read', 'read', 1, null, 0, 'secret excerpt', 1_200, 100, 800, 25)
    db.prepare(`
      INSERT INTO tool_events (
        id, session_id, timestamp, tool_name, tool_category, success,
        command_category, sequence_number, response_summary, mcp_server, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('tool-2', 'raw-local-session-id', 1_786_512_200_000, 'Bash', 'execute', 1, 'test', 1, 'all tests passed', null, null)
    db.prepare(`
      INSERT INTO tool_events (
        id, session_id, timestamp, tool_name, tool_category, success,
        command_category, sequence_number, response_summary, mcp_server, duration_ms,
        attributed_input_tokens, attributed_output_tokens,
        attributed_cached_input_tokens, attributed_reasoning_tokens
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('tool-3', 'raw-local-session-id', 1_786_512_300_000, 'mcp__github__create_issue', 'interact', 1, null, 2, null, 'github', 820, 400, 50, 200, 10)
    db.prepare(`
      INSERT INTO tool_events (
        id, session_id, timestamp, tool_name, tool_category, success,
        command_category, sequence_number, response_summary, mcp_server, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('tool-4', 'raw-local-session-id', 1_786_512_400_000, 'mcp__secret_customer__lookup', 'interact', 0, null, 3, null, 'secret_customer', 6_200)

    const [receipt] = buildNetworkReceipts(db, 'pseudonymous-contributor')
    const serialized = JSON.stringify(receipt)

    expect(receipt).toMatchObject({
      schema_version: 4,
      intent: 'feature_build',
      agent: 'codex',
      model: 'gpt-5.2-codex',
      tool_category_sequence: ['read', 'execute', 'interact', 'interact'],
      mcp_calls: [
        {
          server: 'github', tool: 'create_issue', success: true, latency_bucket: 'fast',
          input_tokens: 400, output_tokens: 50, cached_input_tokens: 200, reasoning_tokens: 10,
        },
        {
          server: 'private', tool: 'private', success: false, latency_bucket: 'slow',
          input_tokens: null, output_tokens: null, cached_input_tokens: null, reasoning_tokens: null,
        },
      ],
      tool_attributions: [
        { category: 'read', input_tokens: 1200, output_tokens: 100, cached_input_tokens: 800, reasoning_tokens: 25 },
        { category: 'execute', input_tokens: null, output_tokens: null, cached_input_tokens: null, reasoning_tokens: null },
        { category: 'interact', input_tokens: 400, output_tokens: 50, cached_input_tokens: 200, reasoning_tokens: 10 },
        { category: 'interact', input_tokens: null, output_tokens: null, cached_input_tokens: null, reasoning_tokens: null },
      ],
      token_usage: {
        input_tokens: 12_000,
        output_tokens: 800,
        cached_input_tokens: 9_000,
        reasoning_tokens: 250,
      },
      duration_bucket: 'short',
      terminal_state: 'completed',
      check_result: 'passed',
    })
    expect(serialized).not.toContain('raw-local-session-id')
    expect(serialized).not.toContain('transcript')
    expect(serialized).not.toContain('secret excerpt')
    expect(serialized).not.toContain('Private project')
    expect(serialized).not.toContain('secret_customer')
  })

  it('normalizes captured model variants to the closed network schema', () => {
    const db = initDb()
    db.prepare(`
      INSERT INTO sessions (
        session_id, model, source, started_at, ended_at, duration_bucket,
        prompt_count, tool_use_count, tool_failure_count, dominant_intent,
        outcome
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'session-with-context-suffix', 'claude-opus-4-6[1m]', 'claude-code',
      1_786_512_000_000, 1_786_512_600_000, 'short', 1, 0, 0,
      'feature_build', 'completed',
    )

    const [receipt] = buildNetworkReceipts(db, 'pseudonymous-contributor')

    expect(receipt.model).toBe('claude-opus-4-6')
    expect(receipt.model).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:/+ -]{0,79}$/)
  })

  it('normalizes fractional timestamps written by legacy importers', () => {
    const db = initDb()
    db.prepare(`
      INSERT INTO sessions (
        session_id, model, source, started_at, ended_at, duration_bucket,
        dominant_intent, outcome
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-fractional-time', 'claude-sonnet-4-6', 'claude-code',
      1_786_512_000_000, 1_786_512_600_000.75, 'short',
      'feature_build', 'completed',
    )

    const [receipt] = buildNetworkReceipts(db, 'pseudonymous-contributor')
    expect(receipt.observed_at).toBe(1_786_512_600_000)
    expect(Number.isSafeInteger(receipt.observed_at)).toBe(true)
  })

  it('summarizes a dry-run without exposing receipt identifiers', () => {
    const summary = summarizeNetworkReceipts([
      {
        schema_version: 2,
        receipt_id: 'private-receipt-id-1',
        observed_at: 1_786_512_600_000,
        intent: 'feature_build',
        agent: 'codex',
        model: 'gpt-5.6-sol',
        tool_category_sequence: ['read', 'write'],
        mcp_calls: [],
        duration_bucket: 'short',
        terminal_state: 'completed',
        check_result: 'passed',
      },
      {
        schema_version: 2,
        receipt_id: 'private-receipt-id-2',
        observed_at: 1_786_512_700_000,
        intent: 'debugging',
        agent: 'claude-code',
        model: 'claude-opus-4-6',
        tool_category_sequence: ['execute'],
        mcp_calls: [],
        duration_bucket: 'quick',
        terminal_state: 'error_exit',
        check_result: 'failed',
      },
    ])

    expect(summary).toEqual({
      total: 2,
      codex: 1,
      claudeCode: 1,
      earliestObservedAt: 1_786_512_600_000,
      latestObservedAt: 1_786_512_700_000,
    })
    expect(JSON.stringify(summary)).not.toContain('private-receipt-id')
  })
})
