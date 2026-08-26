import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { initDb, getSession, insertSession } from './store.js'
import {
  backfillClaudeTokenUsage,
  readClaudeTokenUsage,
  readClaudeTranscriptSummary,
} from './claude-token-usage.js'
import { handleSessionEnd } from './hooks/session-end.js'
import type { SessionRecord } from './types.js'

function assistantUsage(messageId: string, usage: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'assistant',
    uuid: crypto.randomUUID(),
    message: { id: messageId, role: 'assistant', usage },
  })
}

function session(sessionId: string, transcriptPath: string): SessionRecord {
  return {
    session_id: sessionId,
    model: 'claude-sonnet-4-6',
    source: 'claude-code',
    started_at: Date.now() - 1_000,
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
    project_type: null,
    end_reason: null,
    mcp_servers_used: null,
    response_count: 0,
    avg_response_length: 0,
    satisfaction_score: null,
    satisfaction_signals: null,
    subject: null,
    transcript_path: transcriptPath,
  }
}

describe('Claude token usage', () => {
  let dir: string
  let transcriptPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pollen-claude-tokens-'))
    transcriptPath = join(dir, 'session.jsonl')
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('normalizes input totals and deduplicates repeated assistant records', () => {
    const first = assistantUsage('msg-1', {
      input_tokens: 2,
      cache_creation_input_tokens: 10,
      cache_read_input_tokens: 20,
      output_tokens: 5,
    })
    writeFileSync(transcriptPath, [
      first,
      first,
      assistantUsage('msg-2', {
        input_tokens: 3,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 100,
        output_tokens: 7,
      }),
      JSON.stringify({ type: 'user', message: { content: 'must never be returned' } }),
      'malformed json',
    ].join('\n'))

    expect(readClaudeTokenUsage(transcriptPath)).toEqual({
      inputTokens: 135,
      outputTokens: 12,
      cachedInputTokens: 120,
      reasoningTokens: null,
    })
  })

  it('captures explicit reasoning tokens when the transcript provides them', () => {
    writeFileSync(transcriptPath, assistantUsage('msg-reasoning', {
      input_tokens: 10,
      output_tokens: 20,
      cache_read_input_tokens: 0,
      reasoning_tokens: 8,
    }))

    expect(readClaudeTokenUsage(transcriptPath)?.reasoningTokens).toBe(8)
  })

  it('stores only aggregate counts when SessionEnd reads the local transcript', () => {
    writeFileSync(transcriptPath, assistantUsage('msg-end', {
      input_tokens: 11,
      cache_creation_input_tokens: 13,
      cache_read_input_tokens: 17,
      output_tokens: 19,
    }))
    const db: Database.Database = initDb()
    insertSession(db, session('claude-session', transcriptPath))

    handleSessionEnd(db, {
      session_id: 'claude-session',
      hook_event_name: 'SessionEnd',
      transcript_path: transcriptPath,
      reason: 'exit',
    })

    const stored = getSession(db, 'claude-session')!
    expect(stored.input_tokens).toBe(41)
    expect(stored.output_tokens).toBe(19)
    expect(stored.cached_input_tokens).toBe(17)
    expect(stored.reasoning_tokens).toBeNull()
    db.close()
  })

  it('backfills matching historical Claude sessions without persisting new paths', () => {
    const db: Database.Database = initDb()
    const projectsDir = join(dir, 'projects')
    mkdirSync(join(projectsDir, 'fixture-project'), { recursive: true })
    const historicalPath = join(projectsDir, 'fixture-project', 'historical-session.jsonl')
    writeFileSync(historicalPath, assistantUsage('msg-history', {
      input_tokens: 5,
      cache_creation_input_tokens: 7,
      cache_read_input_tokens: 11,
      output_tokens: 13,
      reasoning_tokens: 3,
    }))
    insertSession(db, session('historical-session', ''))

    const result = backfillClaudeTokenUsage(db, { projectsDir, days: 30 })

    expect(result.sessions).toBe(1)
    expect(getSession(db, 'historical-session')).toMatchObject({
      input_tokens: 23,
      output_tokens: 13,
      cached_input_tokens: 11,
      reasoning_tokens: 3,
      transcript_path: '',
    })
    db.close()
  })

  it('backfills the dominant Claude model and privacy-safe MCP events idempotently', () => {
    const db: Database.Database = initDb()
    const projectsDir = join(dir, 'projects')
    mkdirSync(join(projectsDir, 'fixture-project'), { recursive: true })
    const historicalPath = join(projectsDir, 'fixture-project', 'model-session.jsonl')
    const toolUse = {
      type: 'assistant',
      timestamp: '2026-08-14T12:00:00.000Z',
      message: {
        id: 'msg-fable-1',
        model: 'claude-fable-5',
        usage: { input_tokens: 11, cache_read_input_tokens: 4, output_tokens: 5, reasoning_tokens: 3 },
        content: [{
          type: 'tool_use',
          id: 'tool-vibe-1',
          name: 'mcp__vibeconferencing__speak',
          input: { raw_secret: 'must never persist' },
        }, {
          type: 'tool_use',
          id: 'tool-notion-2',
          name: 'mcp__notion__search',
          input: { query: 'must never persist' },
        }],
      },
    }
    writeFileSync(historicalPath, [
      JSON.stringify(toolUse),
      JSON.stringify({
        type: 'user',
        timestamp: '2026-08-14T12:00:01.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'tool-vibe-1', is_error: false, content: 'private output' }] },
      }),
      JSON.stringify({ type: 'assistant', message: { id: 'msg-fable-2', model: 'claude-fable-5', usage: { input_tokens: 5, output_tokens: 2 }, content: [] } }),
      JSON.stringify({ type: 'assistant', message: { id: 'msg-opus-1', model: 'claude-opus-5', usage: { input_tokens: 3, output_tokens: 1 }, content: [] } }),
    ].join('\n'))
    insertSession(db, { ...session('model-session', ''), model: null })

    expect(readClaudeTranscriptSummary(historicalPath)).toMatchObject({
      dominantModel: 'claude-fable-5',
      toolEvents: [
        {
          toolUseId: 'tool-vibe-1', toolName: 'mcp__vibeconferencing__speak', success: true,
          attributedInputTokens: 8, attributedOutputTokens: 3,
          attributedCachedInputTokens: 2, attributedReasoningTokens: 2,
        },
        {
          toolUseId: 'tool-notion-2', toolName: 'mcp__notion__search', success: true,
          attributedInputTokens: 7, attributedOutputTokens: 2,
          attributedCachedInputTokens: 2, attributedReasoningTokens: 1,
        },
      ],
    })

    backfillClaudeTokenUsage(db, { projectsDir, days: 30, now: Date.parse('2026-08-14T12:30:00.000Z') })
    backfillClaudeTokenUsage(db, { projectsDir, days: 30, now: Date.parse('2026-08-14T12:30:00.000Z') })

    expect(getSession(db, 'model-session')?.model).toBe('claude-fable-5')
    const events = db.prepare(`
      SELECT tool_name, mcp_server, success, tool_use_id, response_summary,
             attributed_input_tokens, attributed_output_tokens,
             attributed_cached_input_tokens, attributed_reasoning_tokens
      FROM tool_events WHERE session_id = ? ORDER BY sequence_number
    `).all('model-session')
    expect(events).toEqual([
      {
        tool_name: 'mcp__vibeconferencing__speak', mcp_server: 'vibeconferencing', success: 1,
        tool_use_id: 'tool-vibe-1', response_summary: null,
        attributed_input_tokens: 8, attributed_output_tokens: 3,
        attributed_cached_input_tokens: 2, attributed_reasoning_tokens: 2,
      },
      {
        tool_name: 'mcp__notion__search', mcp_server: 'notion', success: 1,
        tool_use_id: 'tool-notion-2', response_summary: null,
        attributed_input_tokens: 7, attributed_output_tokens: 2,
        attributed_cached_input_tokens: 2, attributed_reasoning_tokens: 1,
      },
    ])
    expect(JSON.stringify(events)).not.toContain('secret')
    expect(JSON.stringify(events)).not.toContain('private output')
    db.close()
  })
})
