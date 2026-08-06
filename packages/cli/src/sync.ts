import { neon } from '@neondatabase/serverless'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import type Database from 'better-sqlite3'
import { SYNC_BATCH_SIZE, getOrCreateContributorId, loadConfig } from './config.js'
import { finalizeStaleSessions } from './finalize.js'

interface SyncResult {
  contributions: number
  tool_events: number
  sessions: number
  lifecycle_events: number
  x402_events: number
  scored: number
}

type SqliteRow = Record<string, unknown>

const CONTRIBUTIONS_COLUMNS = [
  'id', 'timestamp', 'session_id', 'keywords', 'tools_chain', 'language_signals', 'frameworks',
  'prompt_length', 'code_ratio', 'structure_type', 'session_depth',
  'has_error_trace', 'has_code_block', 'day_of_week', 'hour_bucket',
  'intent', 'sub_intent', 'complexity', 'prompt_style', 'domain',
  'taxonomy_version', 'confidence', 'action', 'topic',
  'contributor_id', 'permission_mode',
] as const

const CONTRIBUTIONS_CONFLICT = `
  ON CONFLICT (id) DO UPDATE SET
    timestamp = EXCLUDED.timestamp,
    action = EXCLUDED.action,
    topic = EXCLUDED.topic,
    contributor_id = EXCLUDED.contributor_id,
    permission_mode = EXCLUDED.permission_mode`

const TOOL_EVENTS_COLUMNS = [
  'id', 'session_id', 'timestamp', 'tool_name', 'tool_category',
  'success', 'error_category', 'file_extension', 'command_category',
  'sequence_number', 'mcp_server', 'duration_ms',
  'contributor_id', 'response_type', 'response_size',
  'response_file_paths', 'response_has_code', 'response_has_error', 'response_summary',
  'tool_use_id', 'agent_id', 'agent_type', 'effort_level',
] as const

const SESSIONS_COLUMNS = [
  'session_id', 'model', 'source', 'start_source', 'started_at', 'ended_at',
  'duration_bucket', 'prompt_count', 'tool_use_count', 'tool_failure_count',
  'intent_sequence', 'dominant_intent', 'dominant_domain',
  'unique_tools', 'languages_used', 'outcome',
  'project_type', 'end_reason', 'mcp_servers_used',
  'response_count', 'avg_response_length',
  'satisfaction_score', 'satisfaction_signals', 'subject',
  'contributor_id', 'permission_mode',
  'edit_count', 'read_count', 'search_to_edit_ratio', 'error_recovery_rate',
  'mcp_tool_count', 'unique_mcp_servers', 'subagent_count', 'context_compactions',
  'transcript_path', 'stop_tool_use_count',
  'input_tokens', 'output_tokens', 'cached_input_tokens',
] as const

const SESSIONS_CONFLICT = `
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
    end_reason = EXCLUDED.end_reason,
    mcp_servers_used = EXCLUDED.mcp_servers_used,
    response_count = EXCLUDED.response_count,
    avg_response_length = EXCLUDED.avg_response_length,
    satisfaction_score = EXCLUDED.satisfaction_score,
    satisfaction_signals = EXCLUDED.satisfaction_signals,
    subject = EXCLUDED.subject,
    contributor_id = EXCLUDED.contributor_id,
    permission_mode = EXCLUDED.permission_mode,
    edit_count = EXCLUDED.edit_count,
    read_count = EXCLUDED.read_count,
    search_to_edit_ratio = EXCLUDED.search_to_edit_ratio,
    error_recovery_rate = EXCLUDED.error_recovery_rate,
    mcp_tool_count = EXCLUDED.mcp_tool_count,
    unique_mcp_servers = EXCLUDED.unique_mcp_servers,
    subagent_count = EXCLUDED.subagent_count,
    context_compactions = EXCLUDED.context_compactions,
    transcript_path = COALESCE(EXCLUDED.transcript_path, sessions.transcript_path),
    stop_tool_use_count = EXCLUDED.stop_tool_use_count,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    cached_input_tokens = EXCLUDED.cached_input_tokens`

const LIFECYCLE_COLUMNS = [
  'id', 'session_id', 'timestamp', 'event_type', 'parent_event_id', 'metadata', 'contributor_id',
] as const

const X402_COLUMNS = [
  'id', 'session_id', 'timestamp', 'tool_name', 'mcp_server',
  'service_url', 'service_name', 'success', 'contributor_id',
] as const

/**
 * Insert rows in chunks of SYNC_BATCH_SIZE via multi-row
 * `INSERT ... VALUES ($1,...),(...)` statements. One HTTP round-trip per
 * chunk instead of per row — the @neondatabase/serverless driver has no
 * connection to pipeline over, so per-row inserts made big backfills take
 * ~100ms × rows.
 *
 * A multi-row statement is all-or-nothing: one bad row rolls back its whole
 * chunk. When a chunk fails, retry it row-at-a-time to land the good rows,
 * then rethrow at the poison row — the table's watermark never advances past
 * a failure (same stuck-at-bad-row semantics as the per-row version), and
 * ON CONFLICT makes the re-sync of already-landed rows idempotent.
 */
async function insertBatched(
  sql: NeonQueryFunction<false, false>,
  table: string,
  columns: readonly string[],
  rows: SqliteRow[],
  toValues: (row: SqliteRow) => unknown[],
  conflictClause: string,
): Promise<number> {
  const insertChunk = (chunk: SqliteRow[]) => {
    const params: unknown[] = []
    const tuples = chunk.map((row) => {
      const placeholders = toValues(row).map((value) => {
        params.push(value)
        return `$${params.length}`
      })
      return `(${placeholders.join(', ')})`
    })
    return sql.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}${conflictClause}`,
      params,
    )
  }

  let count = 0
  for (let i = 0; i < rows.length; i += SYNC_BATCH_SIZE) {
    const batch = rows.slice(i, i + SYNC_BATCH_SIZE)
    try {
      await insertChunk(batch)
    } catch {
      for (const row of batch) {
        try {
          await insertChunk([row])
        } catch (err) {
          const msg = (err as Error).message?.split('\n')[0] ?? 'unknown error'
          console.warn(`  (${table} row ${String(toValues(row)[0])} failed: ${msg})`)
          throw err
        }
      }
    }
    count += batch.length
  }
  return count
}

export async function syncToNeon(db: Database.Database, connectionString: string): Promise<SyncResult> {
  const sql = neon(connectionString)
  const contributorId = getOrCreateContributorId()

  // Close out idle sessions first so their outcome/satisfaction ship in
  // this sync instead of staying NULL forever.
  finalizeStaleSessions(db)

  // Upsert contributor identity (wallet + World ID) from ~/.pollen/config.json.
  // Non-fatal: the contributors table may not be migrated yet.
  await syncContributorIdentity(sql, contributorId)

  // Get last sync timestamps from Neon
  const metaRows = await sql`SELECT key, value FROM sync_meta`
  const meta: Record<string, string> = {}
  for (const row of metaRows) {
    meta[row.key as string] = row.value as string
  }

  const lastContrib = parseInt(meta['last_sync_contributions'] ?? '0', 10)
  const lastTool = parseInt(meta['last_sync_tool_events'] ?? '0', 10)
  const lastSession = parseInt(meta['last_sync_sessions'] ?? '0', 10)
  const lastLifecycle = parseInt(meta['last_sync_lifecycle_events'] ?? '0', 10)
  const lastX402 = parseInt(meta['last_sync_x402_events'] ?? '0', 10)

  // Sync contributions
  const contributions = db.prepare(
    'SELECT * FROM contributions WHERE timestamp > ? ORDER BY timestamp'
  ).all(lastContrib) as SqliteRow[]

  const contribCount = await insertBatched(
    sql, 'contributions', CONTRIBUTIONS_COLUMNS, contributions,
    (row) => [
      row.id, toInt(row.timestamp), row.session_id,
      safeJsonb(row.keywords), safeJsonb(row.tools_chain),
      safeJsonb(row.language_signals), safeJsonb(row.frameworks),
      row.prompt_length, row.code_ratio, row.structure_type, row.session_depth,
      toBool(row.has_error_trace), toBool(row.has_code_block),
      row.day_of_week, row.hour_bucket,
      row.intent, row.sub_intent, row.complexity, row.prompt_style, row.domain,
      row.taxonomy_version, row.confidence, row.action, row.topic,
      row.contributor_id ?? contributorId, row.permission_mode,
    ],
    CONTRIBUTIONS_CONFLICT,
  )

  // Update watermark for contributions
  if (contributions.length > 0) {
    const maxTs = contributions[contributions.length - 1].timestamp as number
    await sql`UPDATE sync_meta SET value = ${String(maxTs)} WHERE key = 'last_sync_contributions'`
  }

  // Sync tool_events
  const toolEvents = db.prepare(
    'SELECT * FROM tool_events WHERE timestamp > ? ORDER BY timestamp'
  ).all(lastTool) as SqliteRow[]

  const toolCount = await insertBatched(
    sql, 'tool_events', TOOL_EVENTS_COLUMNS, toolEvents,
    (row) => [
      row.id, row.session_id, toInt(row.timestamp),
      row.tool_name, row.tool_category,
      toBool(row.success), row.error_category, row.file_extension,
      row.command_category, toInt(row.sequence_number), row.mcp_server, toInt(row.duration_ms),
      row.contributor_id ?? contributorId, row.response_type, toInt(row.response_size),
      row.response_file_paths, toBoolNullable(row.response_has_code),
      toBoolNullable(row.response_has_error), row.response_summary,
      row.tool_use_id, row.agent_id, row.agent_type, row.effort_level,
    ],
    '\n  ON CONFLICT (id) DO NOTHING',
  )

  if (toolEvents.length > 0) {
    const maxTs = toolEvents[toolEvents.length - 1].timestamp as number
    await sql`UPDATE sync_meta SET value = ${String(maxTs)} WHERE key = 'last_sync_tool_events'`
  }

  // Sync sessions. Re-select a 7-day overlap window behind the watermark:
  // session rows are updated after started_at (ended_at, outcome,
  // satisfaction_score land at SessionEnd), and a pure `> watermark`
  // predicate would never pick those updates up. The upsert below is
  // idempotent, so re-syncing the window is safe.
  const SESSION_RESYNC_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
  const sessions = db.prepare(
    'SELECT * FROM sessions WHERE started_at > ? ORDER BY started_at'
  ).all(Math.max(0, lastSession - SESSION_RESYNC_WINDOW_MS)) as SqliteRow[]

  const sessionCount = await insertBatched(
    sql, 'sessions', SESSIONS_COLUMNS, sessions,
    (row) => [
      row.session_id, row.model, row.source, row.start_source,
      toInt(row.started_at), toInt(row.ended_at),
      row.duration_bucket, row.prompt_count, row.tool_use_count, row.tool_failure_count,
      safeJsonb(row.intent_sequence), row.dominant_intent, row.dominant_domain,
      safeJsonb(row.unique_tools), safeJsonb(row.languages_used), row.outcome,
      row.project_type, row.end_reason, safeJsonb(row.mcp_servers_used),
      row.response_count, row.avg_response_length,
      row.satisfaction_score, safeJsonb(row.satisfaction_signals),
      row.subject,
      row.contributor_id ?? contributorId, row.permission_mode,
      row.edit_count, row.read_count, row.search_to_edit_ratio, row.error_recovery_rate,
      row.mcp_tool_count, row.unique_mcp_servers, row.subagent_count, row.context_compactions,
      row.transcript_path, toInt(row.stop_tool_use_count),
      toInt(row.input_tokens), toInt(row.output_tokens), toInt(row.cached_input_tokens),
    ],
    SESSIONS_CONFLICT,
  )

  if (sessions.length > 0) {
    const maxTs = sessions[sessions.length - 1].started_at as number
    await sql`UPDATE sync_meta SET value = ${String(maxTs)} WHERE key = 'last_sync_sessions'`
  }

  // Sync lifecycle_events
  let lifecycleCount = 0
  try {
    const lifecycleEvents = db.prepare(
      'SELECT * FROM lifecycle_events WHERE timestamp > ? ORDER BY timestamp'
    ).all(lastLifecycle) as SqliteRow[]

    lifecycleCount = await insertBatched(
      sql, 'lifecycle_events', LIFECYCLE_COLUMNS, lifecycleEvents,
      (row) => [
        row.id, row.session_id, toInt(row.timestamp),
        row.event_type, row.parent_event_id,
        safeJsonb(row.metadata), row.contributor_id ?? contributorId,
      ],
      '\n  ON CONFLICT (id) DO NOTHING',
    )

    if (lifecycleEvents.length > 0) {
      const maxTs = lifecycleEvents[lifecycleEvents.length - 1].timestamp as number
      await sql`INSERT INTO sync_meta (key, value) VALUES ('last_sync_lifecycle_events', ${String(maxTs)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    }
  } catch {
    // lifecycle_events table may not exist locally yet
  }

  // Sync x402_events
  let x402Count = 0
  try {
    const x402Events = db.prepare(
      'SELECT * FROM x402_events WHERE timestamp > ? ORDER BY timestamp'
    ).all(lastX402) as SqliteRow[]

    x402Count = await insertBatched(
      sql, 'x402_events', X402_COLUMNS, x402Events,
      (row) => [
        row.id, row.session_id, toInt(row.timestamp),
        row.tool_name, row.mcp_server,
        row.service_url, row.service_name,
        toBool(row.success), row.contributor_id ?? contributorId,
      ],
      '\n  ON CONFLICT (id) DO NOTHING',
    )

    if (x402Events.length > 0) {
      const maxTs = x402Events[x402Events.length - 1].timestamp as number
      await sql`INSERT INTO sync_meta (key, value) VALUES ('last_sync_x402_events', ${String(maxTs)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    }
  } catch {
    // x402_events table may not exist locally yet
  }

  return {
    contributions: contribCount,
    tool_events: toolCount,
    sessions: sessionCount,
    lifecycle_events: lifecycleCount,
    x402_events: x402Count,
    scored: 0,
  }
}

let warnedContributorSync = false

/**
 * Upsert this machine's contributor row (identity + wallet binding) into Neon.
 *
 * Rules:
 * - wallet_address is first-write-wins: an existing non-NULL address is never
 *   overwritten (prevents a later sync from silently redirecting payouts).
 * - wallet_binding_sig only updates when it belongs to the address we keep.
 * - World ID fields fill in when present locally, never get nulled out.
 * - contributors table may not be migrated yet — warn once, don't fail sync.
 */
async function syncContributorIdentity(
  sql: NeonQueryFunction<false, false>,
  contributorId: string,
): Promise<void> {
  const config = loadConfig()
  const walletAddress = config?.para_wallet?.address ?? config?.wallet_address ?? null
  const bindingSig = config?.wallet_binding_sig ?? null
  const worldId = config?.world_id ?? null

  try {
    await sql`
      INSERT INTO contributors (
        contributor_id, wallet_address, wallet_binding_sig,
        world_id_nullifier, verification_level, verified_at, updated_at
      ) VALUES (
        ${contributorId}, ${walletAddress}, ${bindingSig},
        ${worldId?.nullifier_hash ?? null}, ${worldId?.verification_level ?? null},
        ${worldId?.verified_at ?? null}, NOW()
      )
      ON CONFLICT (contributor_id) DO UPDATE SET
        wallet_address = COALESCE(contributors.wallet_address, EXCLUDED.wallet_address),
        wallet_binding_sig = CASE
          WHEN contributors.wallet_address IS NULL
            OR LOWER(contributors.wallet_address) = LOWER(COALESCE(EXCLUDED.wallet_address, ''))
          THEN COALESCE(EXCLUDED.wallet_binding_sig, contributors.wallet_binding_sig)
          ELSE contributors.wallet_binding_sig
        END,
        world_id_nullifier = COALESCE(EXCLUDED.world_id_nullifier, contributors.world_id_nullifier),
        verification_level = COALESCE(EXCLUDED.verification_level, contributors.verification_level),
        verified_at = COALESCE(EXCLUDED.verified_at, contributors.verified_at),
        updated_at = NOW()
    `
  } catch (err) {
    if (!warnedContributorSync) {
      warnedContributorSync = true
      const msg = (err as Error).message?.split('\n')[0] ?? 'unknown error'
      console.warn(`  (contributor identity not synced: ${msg} — run migration 003_contributors.sql)`)
    }
  }
}

/**
 * Lower the Neon sync watermarks so rows inserted by a backfill (which carry
 * historical timestamps BEHIND the current watermark) become visible to the
 * next `pollen sync`. No-op for watermarks already at or below earliestTs.
 */
export async function lowerNeonWatermarks(connectionString: string, earliestTs: number): Promise<string[]> {
  const sql = neon(connectionString)
  const floor = String(Math.max(0, Math.trunc(earliestTs) - 1))
  const lowered: string[] = []
  for (const key of ['last_sync_tool_events', 'last_sync_sessions', 'last_sync_lifecycle_events']) {
    const res = await sql`
      UPDATE sync_meta SET value = ${floor}
      WHERE key = ${key} AND value::numeric > ${floor}::numeric
      RETURNING key
    `
    if (res.length > 0) lowered.push(key)
  }
  return lowered
}

/**
 * Coerce a numeric value to a whole number for Postgres BIGINT/INT columns.
 * Some historical local rows carry fractional ms timestamps (e.g.
 * 1772833589456.4397), which SQLite stores fine as REAL but Postgres rejects
 * with "invalid input syntax for type bigint" — killing the sync at that row
 * forever, since watermarks only advance after a table completes.
 */
function toInt(val: unknown): number | null {
  if (val == null) return null
  const n = Number(val)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/** Convert SQLite 0/1 to Postgres boolean */
function toBool(val: unknown): boolean {
  return val === 1 || val === true
}

/** Convert SQLite 0/1 to Postgres boolean, preserving null */
function toBoolNullable(val: unknown): boolean | null {
  if (val == null) return null
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
