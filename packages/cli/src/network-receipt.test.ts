import { describe, expect, it } from 'vitest'
import { initDb } from './store.js'
import { buildNetworkReceipts } from './network-receipt.js'

describe('network receipts', () => {
  it('builds the closed privacy schema without raw local fields', () => {
    const db = initDb()
    db.prepare(`
      INSERT INTO sessions (
        session_id, model, source, started_at, ended_at, duration_bucket,
        prompt_count, tool_use_count, tool_failure_count, dominant_intent,
        outcome, transcript_path, subject
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'raw-local-session-id', 'gpt-5.2-codex', 'codex', 1_786_512_000_000,
      1_786_512_600_000, 'short', 3, 2, 0, 'feature_build', 'completed',
      '/Users/someone/secret/transcript.jsonl', 'Private project name',
    )
    db.prepare(`
      INSERT INTO tool_events (
        id, session_id, timestamp, tool_name, tool_category, success,
        command_category, sequence_number, response_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('tool-1', 'raw-local-session-id', 1_786_512_100_000, 'Read', 'read', 1, null, 0, 'secret excerpt')
    db.prepare(`
      INSERT INTO tool_events (
        id, session_id, timestamp, tool_name, tool_category, success,
        command_category, sequence_number, response_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('tool-2', 'raw-local-session-id', 1_786_512_200_000, 'Bash', 'execute', 1, 'test', 1, 'all tests passed')

    const [receipt] = buildNetworkReceipts(db, 'pseudonymous-contributor')
    const serialized = JSON.stringify(receipt)

    expect(receipt).toMatchObject({
      schema_version: 1,
      intent: 'feature_build',
      agent: 'codex',
      model: 'gpt-5.2-codex',
      tool_category_sequence: ['read', 'execute'],
      duration_bucket: 'short',
      terminal_state: 'completed',
      check_result: 'passed',
    })
    expect(serialized).not.toContain('raw-local-session-id')
    expect(serialized).not.toContain('transcript')
    expect(serialized).not.toContain('secret excerpt')
    expect(serialized).not.toContain('Private project')
  })
})
