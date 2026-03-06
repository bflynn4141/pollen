import { neon } from '@neondatabase/serverless'
import type Database from 'better-sqlite3'
import { SYNC_BATCH_SIZE } from './config.js'

interface SyncResult {
  contributions: number
  tool_events: number
  sessions: number
  scored: number
}

export async function syncToNeon(db: Database.Database, connectionString: string): Promise<SyncResult> {
  const sql = neon(connectionString)

  // Get last sync timestamps from Neon
  const metaRows = await sql`SELECT key, value FROM sync_meta`
  const meta: Record<string, string> = {}
  for (const row of metaRows) {
    meta[row.key as string] = row.value as string
  }

  const lastContrib = parseInt(meta['last_sync_contributions'] ?? '0', 10)
  const lastTool = parseInt(meta['last_sync_tool_events'] ?? '0', 10)
  const lastSession = parseInt(meta['last_sync_sessions'] ?? '0', 10)

  // Sync contributions
  const contributions = db.prepare(
    'SELECT * FROM contributions WHERE timestamp > ? ORDER BY timestamp'
  ).all(lastContrib) as Record<string, unknown>[]

  let contribCount = 0
  for (let i = 0; i < contributions.length; i += SYNC_BATCH_SIZE) {
    const batch = contributions.slice(i, i + SYNC_BATCH_SIZE)
    for (const row of batch) {
      await sql`
        INSERT INTO contributions (
          id, timestamp, session_id, keywords, tools_chain, language_signals, frameworks,
          prompt_length, code_ratio, structure_type, session_depth,
          has_error_trace, has_code_block, day_of_week, hour_bucket,
          intent, sub_intent, complexity, prompt_style, domain,
          taxonomy_version, confidence, action, topic
        ) VALUES (
          ${row.id}, ${row.timestamp}, ${row.session_id},
          ${safeJsonb(row.keywords)}, ${safeJsonb(row.tools_chain)},
          ${safeJsonb(row.language_signals)}, ${safeJsonb(row.frameworks)},
          ${row.prompt_length}, ${row.code_ratio}, ${row.structure_type}, ${row.session_depth},
          ${toBool(row.has_error_trace)}, ${toBool(row.has_code_block)},
          ${row.day_of_week}, ${row.hour_bucket},
          ${row.intent}, ${row.sub_intent}, ${row.complexity}, ${row.prompt_style}, ${row.domain},
          ${row.taxonomy_version}, ${row.confidence}, ${row.action}, ${row.topic}
        )
        ON CONFLICT (id) DO UPDATE SET
          timestamp = EXCLUDED.timestamp,
          action = EXCLUDED.action,
          topic = EXCLUDED.topic
      `
    }
    contribCount += batch.length
  }

  // Update watermark for contributions
  if (contributions.length > 0) {
    const maxTs = contributions[contributions.length - 1].timestamp as number
    await sql`UPDATE sync_meta SET value = ${String(maxTs)} WHERE key = 'last_sync_contributions'`
  }

  // Sync tool_events
  const toolEvents = db.prepare(
    'SELECT * FROM tool_events WHERE timestamp > ? ORDER BY timestamp'
  ).all(lastTool) as Record<string, unknown>[]

  let toolCount = 0
  for (let i = 0; i < toolEvents.length; i += SYNC_BATCH_SIZE) {
    const batch = toolEvents.slice(i, i + SYNC_BATCH_SIZE)
    for (const row of batch) {
      await sql`
        INSERT INTO tool_events (
          id, session_id, timestamp, tool_name, tool_category,
          success, error_category, file_extension, command_category,
          sequence_number, mcp_server, duration_ms
        ) VALUES (
          ${row.id}, ${row.session_id}, ${row.timestamp},
          ${row.tool_name}, ${row.tool_category},
          ${toBool(row.success)}, ${row.error_category}, ${row.file_extension},
          ${row.command_category}, ${row.sequence_number}, ${row.mcp_server}, ${row.duration_ms}
        )
        ON CONFLICT (id) DO NOTHING
      `
    }
    toolCount += batch.length
  }

  if (toolEvents.length > 0) {
    const maxTs = toolEvents[toolEvents.length - 1].timestamp as number
    await sql`UPDATE sync_meta SET value = ${String(maxTs)} WHERE key = 'last_sync_tool_events'`
  }

  // Sync sessions
  const sessions = db.prepare(
    'SELECT * FROM sessions WHERE started_at > ? ORDER BY started_at'
  ).all(lastSession) as Record<string, unknown>[]

  let sessionCount = 0
  for (let i = 0; i < sessions.length; i += SYNC_BATCH_SIZE) {
    const batch = sessions.slice(i, i + SYNC_BATCH_SIZE)
    for (const row of batch) {
      await sql`
        INSERT INTO sessions (
          session_id, model, source, started_at, ended_at,
          duration_bucket, prompt_count, tool_use_count, tool_failure_count,
          intent_sequence, dominant_intent, dominant_domain,
          unique_tools, languages_used, outcome,
          project_type, end_reason, mcp_servers_used,
          response_count, avg_response_length,
          satisfaction_score, satisfaction_signals, subject
        ) VALUES (
          ${row.session_id}, ${row.model}, ${row.source},
          ${row.started_at}, ${row.ended_at},
          ${row.duration_bucket}, ${row.prompt_count}, ${row.tool_use_count}, ${row.tool_failure_count},
          ${safeJsonb(row.intent_sequence)}, ${row.dominant_intent}, ${row.dominant_domain},
          ${safeJsonb(row.unique_tools)}, ${safeJsonb(row.languages_used)}, ${row.outcome},
          ${row.project_type}, ${row.end_reason}, ${safeJsonb(row.mcp_servers_used)},
          ${row.response_count}, ${row.avg_response_length},
          ${row.satisfaction_score}, ${safeJsonb(row.satisfaction_signals)},
          ${row.subject}
        )
        ON CONFLICT (session_id) DO UPDATE SET
          ended_at = EXCLUDED.ended_at,
          duration_bucket = EXCLUDED.duration_bucket,
          prompt_count = EXCLUDED.prompt_count,
          tool_use_count = EXCLUDED.tool_use_count,
          tool_failure_count = EXCLUDED.tool_failure_count,
          intent_sequence = EXCLUDED.intent_sequence,
          dominant_intent = EXCLUDED.dominant_intent,
          dominant_domain = EXCLUDED.dominant_domain,
          unique_tools = EXCLUDED.unique_tools,
          languages_used = EXCLUDED.languages_used,
          outcome = EXCLUDED.outcome,
          satisfaction_score = EXCLUDED.satisfaction_score,
          satisfaction_signals = EXCLUDED.satisfaction_signals,
          subject = EXCLUDED.subject
      `
    }
    sessionCount += batch.length
  }

  if (sessions.length > 0) {
    const maxTs = sessions[sessions.length - 1].started_at as number
    await sql`UPDATE sync_meta SET value = ${String(maxTs)} WHERE key = 'last_sync_sessions'`
  }

  return {
    contributions: contribCount,
    tool_events: toolCount,
    sessions: sessionCount,
    scored: 0,
  }
}

/** Convert SQLite 0/1 to Postgres boolean */
function toBool(val: unknown): boolean {
  return val === 1 || val === true
}

/** Parse TEXT JSON from SQLite into a value suitable for Postgres JSONB */
function safeJsonb(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === 'string') {
    try {
      JSON.parse(val) // validate it's actually JSON
      return val
    } catch {
      return null
    }
  }
  return JSON.stringify(val)
}
