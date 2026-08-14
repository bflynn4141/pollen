import Database from 'better-sqlite3'
import type { Contribution, CoarsenedToolEvent, SessionRecord } from './types.js'
import { migrateSchema } from './migrate.js'
import { MS_PER_DAY } from './config.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  session_id TEXT,
  keywords TEXT,
  tools_chain TEXT,
  language_signals TEXT,
  frameworks TEXT,
  prompt_length TEXT,
  code_ratio TEXT,
  structure_type TEXT,
  session_depth TEXT,
  has_error_trace INTEGER,
  has_code_block INTEGER,
  day_of_week TEXT,
  hour_bucket TEXT,
  intent TEXT,
  sub_intent TEXT,
  complexity TEXT,
  prompt_style TEXT,
  domain TEXT,
  taxonomy_version TEXT DEFAULT 'v1.0',
  confidence REAL,
  action TEXT,
  topic TEXT,
  contributor_id TEXT,
  permission_mode TEXT
);

CREATE INDEX IF NOT EXISTS idx_intent ON contributions(intent);
CREATE INDEX IF NOT EXISTS idx_timestamp ON contributions(timestamp);
CREATE INDEX IF NOT EXISTS idx_session ON contributions(session_id);
CREATE INDEX IF NOT EXISTS idx_action ON contributions(action);
CREATE INDEX IF NOT EXISTS idx_topic ON contributions(topic);

CREATE TABLE IF NOT EXISTS tool_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 1,
  error_category TEXT,
  file_extension TEXT,
  command_category TEXT,
  sequence_number INTEGER NOT NULL DEFAULT 0,
  mcp_server TEXT,
  duration_ms INTEGER,
  contributor_id TEXT,
  response_type TEXT,
  response_size INTEGER,
  response_file_paths INTEGER,
  response_has_code INTEGER,
  response_has_error INTEGER,
  response_summary TEXT,
  tool_use_id TEXT,
  agent_id TEXT,
  agent_type TEXT,
  effort_level TEXT
);

CREATE INDEX IF NOT EXISTS idx_tool_session ON tool_events(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_name ON tool_events(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_timestamp ON tool_events(timestamp);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  model TEXT,
  source TEXT,
  start_source TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_bucket TEXT,
  prompt_count INTEGER NOT NULL DEFAULT 0,
  tool_use_count INTEGER NOT NULL DEFAULT 0,
  tool_failure_count INTEGER NOT NULL DEFAULT 0,
  intent_sequence TEXT,
  dominant_intent TEXT,
  dominant_domain TEXT,
  unique_tools TEXT,
  languages_used TEXT,
  outcome TEXT,
  project_type TEXT,
  end_reason TEXT,
  mcp_servers_used TEXT,
  response_count INTEGER NOT NULL DEFAULT 0,
  avg_response_length INTEGER NOT NULL DEFAULT 0,
  satisfaction_score INTEGER,
  satisfaction_signals TEXT,
  subject TEXT,
  contributor_id TEXT,
  edit_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  search_to_edit_ratio REAL,
  error_recovery_rate REAL,
  mcp_tool_count INTEGER DEFAULT 0,
  unique_mcp_servers INTEGER DEFAULT 0,
  permission_mode TEXT,
  subagent_count INTEGER DEFAULT 0,
  context_compactions INTEGER DEFAULT 0,
  transcript_path TEXT,
  stop_tool_use_count INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cached_input_tokens INTEGER
);

CREATE INDEX IF NOT EXISTS idx_session_started ON sessions(started_at);
`

const LIFECYCLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS lifecycle_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  parent_event_id TEXT,
  metadata TEXT,
  contributor_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_session ON lifecycle_events(session_id, event_type);
`

const X402_SCHEMA = `
CREATE TABLE IF NOT EXISTS x402_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  mcp_server TEXT NOT NULL,
  service_url TEXT,
  service_name TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  contributor_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_x402_session ON x402_events(session_id);
CREATE INDEX IF NOT EXISTS idx_x402_timestamp ON x402_events(timestamp);
`

// LOCAL-ONLY: brief_log + brief_kv power the weekly Pollen Brief.
// These tables must NEVER be added to sync.ts — they are device-local state.
const BRIEF_SCHEMA = `
CREATE TABLE IF NOT EXISTS brief_log (
  id TEXT PRIMARY KEY,
  iso_week TEXT NOT NULL UNIQUE,
  generated_at INTEGER NOT NULL,
  sent_to TEXT,
  findings_json TEXT,
  html_path TEXT
);

CREATE TABLE IF NOT EXISTS brief_kv (
  key TEXT PRIMARY KEY,
  value TEXT
);
`

// LOCAL-ONLY: durable delivery state for privacy-safe network receipts.
// The outbox stores session IDs and retry metadata, never network credentials.
const NETWORK_OUTBOX_SCHEMA = `
CREATE TABLE IF NOT EXISTS network_receipt_outbox (
  session_id TEXT PRIMARY KEY REFERENCES sessions(session_id) ON DELETE CASCADE,
  enqueued_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_until INTEGER,
  last_error TEXT,
  synced_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_network_receipt_outbox_ready
  ON network_receipt_outbox(next_attempt_at)
  WHERE synced_at IS NULL;
`

export function initDb(dbPath?: string): Database.Database {
  const db = dbPath ? new Database(dbPath) : new Database(':memory:')
  db.pragma('journal_mode = WAL')
  // Migrate existing tables first (adds new columns), then create schema
  // (CREATE TABLE IF NOT EXISTS is a no-op for existing tables, but
  //  CREATE INDEX on new columns needs the columns to exist first)
  migrateSchema(db)
  db.exec(SCHEMA)
  db.exec(LIFECYCLE_SCHEMA)
  db.exec(X402_SCHEMA)
  db.exec(BRIEF_SCHEMA)
  db.exec(NETWORK_OUTBOX_SCHEMA)
  return db
}

// --- Pollen Brief (local-only) ---

/**
 * Claim the weekly brief slot for `isoWeek` (e.g. "2026-W32").
 * INSERT OR IGNORE on the UNIQUE iso_week means concurrent SessionStart hooks
 * can't double-send: exactly one caller gets `true`.
 */
export function claimBriefWeek(db: Database.Database, isoWeek: string, now = Date.now()): boolean {
  const result = db.prepare(`
    INSERT OR IGNORE INTO brief_log (id, iso_week, generated_at)
    VALUES (?, ?, ?)
  `).run(`brief-${isoWeek}`, isoWeek, now)
  return result.changes > 0
}

export interface BriefLogRow {
  id: string
  iso_week: string
  generated_at: number
  sent_to: string | null
  findings_json: string | null
  html_path: string | null
}

export function getBriefLog(db: Database.Database, isoWeek: string): BriefLogRow | undefined {
  return db.prepare('SELECT * FROM brief_log WHERE iso_week = ?').get(isoWeek) as BriefLogRow | undefined
}

/** Upsert the brief record for a week (used by `pollen brief` after generate/send). */
export function recordBrief(
  db: Database.Database,
  entry: { isoWeek: string; sentTo?: string | null; findingsJson?: string | null; htmlPath?: string | null; now?: number },
): void {
  db.prepare(`
    INSERT OR IGNORE INTO brief_log (id, iso_week, generated_at)
    VALUES (?, ?, ?)
  `).run(`brief-${entry.isoWeek}`, entry.isoWeek, entry.now ?? Date.now())
  db.prepare(`
    UPDATE brief_log SET
      generated_at = ?,
      sent_to = COALESCE(?, sent_to),
      findings_json = COALESCE(?, findings_json),
      html_path = COALESCE(?, html_path)
    WHERE iso_week = ?
  `).run(
    entry.now ?? Date.now(),
    entry.sentTo ?? null,
    entry.findingsJson ?? null,
    entry.htmlPath ?? null,
    entry.isoWeek,
  )
}

export function getBriefKv(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM brief_kv WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setBriefKv(db: Database.Database, key: string, value: string): void {
  db.prepare(`
    INSERT INTO brief_kv (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

// --- x402 Events ---

export interface X402Event {
  id: string
  session_id: string
  timestamp: number
  tool_name: string
  mcp_server: string
  service_url: string | null
  service_name: string | null
  success: boolean
  contributor_id?: string | null
}

export function insertX402Event(db: Database.Database, event: X402Event): void {
  db.prepare(`
    INSERT INTO x402_events (id, session_id, timestamp, tool_name, mcp_server, service_url, service_name, success, contributor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id, event.session_id, event.timestamp, event.tool_name,
    event.mcp_server, event.service_url, event.service_name,
    event.success ? 1 : 0,
    event.contributor_id ?? null,
  )
}

// --- Lifecycle Events ---

export interface LifecycleEvent {
  id: string
  session_id: string
  timestamp: number
  event_type: string
  parent_event_id?: string | null
  metadata?: string | null
  contributor_id?: string | null
}

export function insertLifecycleEvent(db: Database.Database, event: LifecycleEvent): void {
  // INSERT OR IGNORE: live hooks use random UUIDs; the Codex backfill uses
  // deterministic ids so re-runs are no-ops.
  db.prepare(`
    INSERT OR IGNORE INTO lifecycle_events (id, session_id, timestamp, event_type, parent_event_id, metadata, contributor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id, event.session_id, event.timestamp, event.event_type,
    event.parent_event_id ?? null, event.metadata ?? null, event.contributor_id ?? null,
  )
}

export function insertContribution(db: Database.Database, c: Contribution): void {
  const stmt = db.prepare(`
    INSERT INTO contributions (
      id, timestamp, session_id,
      keywords, tools_chain, language_signals, frameworks,
      prompt_length, code_ratio, structure_type, session_depth,
      has_error_trace, has_code_block, day_of_week, hour_bucket,
      intent, sub_intent, complexity, prompt_style, domain,
      taxonomy_version, confidence,
      action, topic, contributor_id, permission_mode
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?
    )
  `)

  stmt.run(
    c.id, c.timestamp, c.session_id ?? null,
    JSON.stringify(c.features.keywords),
    JSON.stringify(c.features.tools_chain),
    JSON.stringify(c.features.language_signals),
    JSON.stringify(c.features.frameworks),
    c.features.prompt_length,
    c.features.code_ratio,
    c.features.structure_type,
    c.features.session_depth,
    c.features.has_error_trace ? 1 : 0,
    c.features.has_code_block ? 1 : 0,
    c.features.day_of_week,
    c.features.hour_bucket,
    c.labels.intent,
    c.labels.sub_intent ?? null,
    c.labels.complexity,
    c.labels.prompt_style,
    c.labels.domain,
    c.labels.taxonomy_version,
    c.labels.confidence,
    c.action ?? null,
    c.topic ?? null,
    c.contributor_id ?? null,
    c.permission_mode ?? null,
  )
}

export function getSessionPromptCount(db: Database.Database, sessionId: string): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM contributions WHERE session_id = ?').get(sessionId) as { count: number }
  return row.count
}

export interface IntentRow { intent: string; count: number }
export function queryIntentDistribution(db: Database.Database, days?: number): IntentRow[] {
  let sql = 'SELECT intent, COUNT(*) as count FROM contributions'
  const params: unknown[] = []
  if (days) {
    const cutoff = Date.now() - days * MS_PER_DAY
    sql += ' WHERE timestamp > ?'
    params.push(cutoff)
  }
  sql += ' GROUP BY intent ORDER BY count DESC'
  return db.prepare(sql).all(...params) as IntentRow[]
}

export interface LangRow { language: string; count: number }
export function queryLanguageDistribution(db: Database.Database): LangRow[] {
  return db.prepare(`
    SELECT value as language, COUNT(*) as count
    FROM contributions, json_each(contributions.language_signals)
    GROUP BY value ORDER BY count DESC
  `).all() as LangRow[]
}

export interface ToolRow { tool: string; count: number }
export function queryToolUsage(db: Database.Database): ToolRow[] {
  return db.prepare(`
    SELECT value as tool, COUNT(*) as count
    FROM contributions, json_each(contributions.tools_chain)
    GROUP BY value ORDER BY count DESC
  `).all() as ToolRow[]
}

export interface SessionStatsRow { session_id: string; prompt_count: number }
export function querySessionStats(db: Database.Database): { avg: number; sessions: SessionStatsRow[] } {
  const sessions = db.prepare(`
    SELECT session_id, COUNT(*) as prompt_count
    FROM contributions
    WHERE session_id IS NOT NULL
    GROUP BY session_id ORDER BY prompt_count DESC
  `).all() as SessionStatsRow[]

  const avg = sessions.length > 0
    ? sessions.reduce((sum, s) => sum + s.prompt_count, 0) / sessions.length
    : 0

  return { avg, sessions }
}

export interface TimeRow { bucket: string; count: number }
export function queryTimePatterns(db: Database.Database): { byHour: TimeRow[]; byDay: TimeRow[] } {
  const byHour = db.prepare(`
    SELECT hour_bucket as bucket, COUNT(*) as count
    FROM contributions GROUP BY hour_bucket ORDER BY count DESC
  `).all() as TimeRow[]

  const byDay = db.prepare(`
    SELECT day_of_week as bucket, COUNT(*) as count
    FROM contributions GROUP BY day_of_week ORDER BY count DESC
  `).all() as TimeRow[]

  return { byHour, byDay }
}

export interface TrendRow { date: string; count: number }
export function queryTrends(db: Database.Database, days = 7): TrendRow[] {
  const cutoff = Date.now() - days * MS_PER_DAY
  return db.prepare(`
    SELECT date(timestamp / 1000, 'unixepoch') as date, COUNT(*) as count
    FROM contributions
    WHERE timestamp > ?
    GROUP BY date ORDER BY date
  `).all(cutoff) as TrendRow[]
}

export interface Stats {
  total: number
  firstSeen: number | null
  lastSeen: number | null
  uniqueSessions: number
}
export function getStats(db: Database.Database): Stats {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      MIN(timestamp) as firstSeen,
      MAX(timestamp) as lastSeen,
      COUNT(DISTINCT session_id) as uniqueSessions
    FROM contributions
  `).get() as Stats
  return row
}

// --- Tool Events ---

export function insertToolEvent(db: Database.Database, event: CoarsenedToolEvent): void {
  // INSERT OR IGNORE: live hooks use random UUIDs (never collide); the Codex
  // backfill uses deterministic ids so re-runs are no-ops.
  db.prepare(`
    INSERT OR IGNORE INTO tool_events (
      id, session_id, timestamp, tool_name, tool_category,
      success, error_category, file_extension, command_category, sequence_number,
      mcp_server, duration_ms, contributor_id,
      response_type, response_size, response_file_paths,
      response_has_code, response_has_error, response_summary,
      tool_use_id, agent_id, agent_type, effort_level
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.session_id,
    event.timestamp,
    event.tool_name,
    event.tool_category,
    event.success ? 1 : 0,
    event.error_category,
    event.file_extension,
    event.command_category,
    event.sequence_number,
    event.mcp_server,
    event.duration_ms,
    event.contributor_id ?? null,
    event.response_type ?? null,
    event.response_size ?? null,
    event.response_file_paths ?? null,
    event.response_has_code != null ? (event.response_has_code ? 1 : 0) : null,
    event.response_has_error != null ? (event.response_has_error ? 1 : 0) : null,
    event.response_summary ?? null,
    event.tool_use_id ?? null,
    event.agent_id ?? null,
    event.agent_type ?? null,
    event.effort_level ?? null,
  )
}

export function getToolEventCount(db: Database.Database, sessionId: string): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM tool_events WHERE session_id = ?').get(sessionId) as { count: number }
  return row.count
}

export interface ToolFrequencyRow { tool_name: string; count: number; success_count: number; failure_count: number }
export function queryToolFrequency(db: Database.Database, days?: number): ToolFrequencyRow[] {
  let sql = `
    SELECT tool_name,
      COUNT(*) as count,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count
    FROM tool_events
  `
  const params: unknown[] = []
  if (days) {
    const cutoff = Date.now() - days * MS_PER_DAY
    sql += ' WHERE timestamp > ?'
    params.push(cutoff)
  }
  sql += ' GROUP BY tool_name ORDER BY count DESC'
  return db.prepare(sql).all(...params) as ToolFrequencyRow[]
}

export interface ToolPairRow { tool_a: string; tool_b: string; count: number }
export function queryToolPairs(db: Database.Database): ToolPairRow[] {
  // Deduplicate self-loops: skip pairs where tool_a === tool_b (parallel calls)
  return db.prepare(`
    SELECT a.tool_name as tool_a, b.tool_name as tool_b, COUNT(*) as count
    FROM tool_events a
    JOIN tool_events b
      ON a.session_id = b.session_id
      AND b.sequence_number = a.sequence_number + 1
    WHERE a.tool_name != b.tool_name
    GROUP BY a.tool_name, b.tool_name
    ORDER BY count DESC
    LIMIT 20
  `).all() as ToolPairRow[]
}

export interface ToolTripleRow { tool_a: string; tool_b: string; tool_c: string; count: number }
export function queryToolTriples(db: Database.Database): ToolTripleRow[] {
  // 3-step flows with self-loop deduplication
  return db.prepare(`
    SELECT a.tool_name as tool_a, b.tool_name as tool_b, c.tool_name as tool_c, COUNT(*) as count
    FROM tool_events a
    JOIN tool_events b
      ON a.session_id = b.session_id
      AND b.sequence_number = a.sequence_number + 1
    JOIN tool_events c
      ON b.session_id = c.session_id
      AND c.sequence_number = b.sequence_number + 1
    WHERE a.tool_name != b.tool_name
      AND b.tool_name != c.tool_name
    GROUP BY a.tool_name, b.tool_name, c.tool_name
    ORDER BY count DESC
    LIMIT 20
  `).all() as ToolTripleRow[]
}

export interface ToolFailureRow { tool_name: string; error_category: string; count: number }
export function queryToolFailures(db: Database.Database): ToolFailureRow[] {
  return db.prepare(`
    SELECT tool_name, error_category, COUNT(*) as count
    FROM tool_events
    WHERE success = 0 AND error_category IS NOT NULL
    GROUP BY tool_name, error_category
    ORDER BY count DESC
  `).all() as ToolFailureRow[]
}

// --- Sessions ---

export function insertSession(db: Database.Database, session: SessionRecord): void {
  db.prepare(`
    INSERT OR IGNORE INTO sessions (
      session_id, model, source, start_source, started_at, ended_at,
      duration_bucket, prompt_count, tool_use_count, tool_failure_count,
      intent_sequence, dominant_intent, dominant_domain,
      unique_tools, languages_used, outcome,
      project_type, end_reason, mcp_servers_used, response_count, avg_response_length,
      satisfaction_score, satisfaction_signals, subject,
      contributor_id, permission_mode,
      edit_count, read_count, search_to_edit_ratio, error_recovery_rate,
      mcp_tool_count, unique_mcp_servers, subagent_count, context_compactions,
      transcript_path, input_tokens, output_tokens, cached_input_tokens
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.session_id,
    session.model,
    session.source,
    session.start_source ?? null,
    session.started_at,
    session.ended_at,
    session.duration_bucket,
    session.prompt_count,
    session.tool_use_count,
    session.tool_failure_count,
    session.intent_sequence,
    session.dominant_intent,
    session.dominant_domain,
    session.unique_tools,
    session.languages_used,
    session.outcome,
    session.project_type,
    session.end_reason,
    session.mcp_servers_used,
    session.response_count,
    session.avg_response_length,
    session.satisfaction_score,
    session.satisfaction_signals,
    session.subject ?? null,
    session.contributor_id ?? null,
    session.permission_mode ?? null,
    session.edit_count ?? 0,
    session.read_count ?? 0,
    session.search_to_edit_ratio ?? null,
    session.error_recovery_rate ?? null,
    session.mcp_tool_count ?? 0,
    session.unique_mcp_servers ?? 0,
    session.subagent_count ?? 0,
    session.context_compactions ?? 0,
    session.transcript_path ?? null,
    session.input_tokens ?? null,
    session.output_tokens ?? null,
    session.cached_input_tokens ?? null,
  )
}

export function updateSession(db: Database.Database, session: Partial<SessionRecord> & { session_id: string }): void {
  const fields: string[] = []
  const values: unknown[] = []

  const updatable: Array<keyof SessionRecord> = [
    'ended_at', 'duration_bucket', 'prompt_count', 'tool_use_count',
    'tool_failure_count', 'intent_sequence', 'dominant_intent', 'dominant_domain',
    'unique_tools', 'languages_used', 'outcome',
    'project_type', 'end_reason', 'mcp_servers_used', 'response_count', 'avg_response_length',
    'satisfaction_score', 'satisfaction_signals',
    'subject', 'permission_mode',
    'edit_count', 'read_count', 'search_to_edit_ratio', 'error_recovery_rate',
    'mcp_tool_count', 'unique_mcp_servers', 'subagent_count', 'context_compactions',
    'transcript_path', 'stop_tool_use_count',
    'input_tokens', 'output_tokens', 'cached_input_tokens',
  ]

  for (const key of updatable) {
    if (key in session) {
      fields.push(`${key} = ?`)
      values.push(session[key] ?? null)
    }
  }

  if (fields.length === 0) return
  values.push(session.session_id)
  db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE session_id = ?`).run(...values)
}

export function getSession(db: Database.Database, sessionId: string): SessionRecord | undefined {
  return db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as SessionRecord | undefined
}

export interface SessionSummaryRow {
  session_id: string
  started_at: number
  ended_at: number | null
  duration_bucket: string | null
  prompt_count: number
  tool_use_count: number
  tool_failure_count: number
  dominant_intent: string | null
  dominant_domain: string | null
  outcome: string | null
}
export function querySessionSummaries(db: Database.Database, limit = 20): SessionSummaryRow[] {
  return db.prepare(`
    SELECT session_id, started_at, ended_at, duration_bucket,
      prompt_count, tool_use_count, tool_failure_count,
      dominant_intent, dominant_domain, outcome
    FROM sessions
    ORDER BY started_at DESC
    LIMIT ?
  `).all(limit) as SessionSummaryRow[]
}

export interface SessionArcRow { dominant_intent: string; outcome: string; count: number }
export function querySessionArcs(db: Database.Database): SessionArcRow[] {
  return db.prepare(`
    SELECT dominant_intent, outcome, COUNT(*) as count
    FROM sessions
    WHERE dominant_intent IS NOT NULL AND outcome IS NOT NULL
    GROUP BY dominant_intent, outcome
    ORDER BY count DESC
  `).all() as SessionArcRow[]
}

// --- MCP Server queries ---

export interface McpServerRow {
  mcp_server: string
  call_count: number
  success_count: number
  failure_count: number
  unique_sessions: number
}
export function queryMcpServerUsage(db: Database.Database): McpServerRow[] {
  return db.prepare(`
    SELECT
      mcp_server,
      COUNT(*) as call_count,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count,
      COUNT(DISTINCT session_id) as unique_sessions
    FROM tool_events
    WHERE mcp_server IS NOT NULL
    GROUP BY mcp_server
    ORDER BY call_count DESC
  `).all() as McpServerRow[]
}

// --- Project type queries ---

export interface ProjectTypeRow { project_type: string; session_count: number }
export function queryProjectDistribution(db: Database.Database): ProjectTypeRow[] {
  return db.prepare(`
    SELECT project_type, COUNT(*) as session_count
    FROM sessions
    WHERE project_type IS NOT NULL
    GROUP BY project_type
    ORDER BY session_count DESC
  `).all() as ProjectTypeRow[]
}

// --- Response stats helpers ---

export function getSessionResponseStats(db: Database.Database, sessionId: string): { response_count: number; avg_response_length: number } {
  const row = db.prepare('SELECT response_count, avg_response_length FROM sessions WHERE session_id = ?').get(sessionId) as { response_count: number; avg_response_length: number } | undefined
  return row ?? { response_count: 0, avg_response_length: 0 }
}

export function incrementResponseStats(db: Database.Database, sessionId: string, charCount: number): void {
  const current = getSessionResponseStats(db, sessionId)
  const newCount = current.response_count + 1
  const newAvg = Math.round(
    (current.avg_response_length * current.response_count + charCount) / newCount
  )
  db.prepare('UPDATE sessions SET response_count = ?, avg_response_length = ? WHERE session_id = ?')
    .run(newCount, newAvg, sessionId)
}

// --- Topic queries ---

export interface TopicRow { topic: string; count: number }
export function queryTopicDistribution(db: Database.Database, days?: number): TopicRow[] {
  let sql = 'SELECT topic, COUNT(*) as count FROM contributions WHERE topic IS NOT NULL'
  const params: unknown[] = []
  if (days) {
    const cutoff = Date.now() - days * MS_PER_DAY
    sql += ' AND timestamp > ?'
    params.push(cutoff)
  }
  sql += ' GROUP BY topic ORDER BY count DESC'
  return db.prepare(sql).all(...params) as TopicRow[]
}

export interface ActionRow { action: string; count: number }
export function queryActionDistribution(db: Database.Database, days?: number): ActionRow[] {
  let sql = 'SELECT action, COUNT(*) as count FROM contributions WHERE action IS NOT NULL'
  const params: unknown[] = []
  if (days) {
    const cutoff = Date.now() - days * MS_PER_DAY
    sql += ' AND timestamp > ?'
    params.push(cutoff)
  }
  sql += ' GROUP BY action ORDER BY count DESC'
  return db.prepare(sql).all(...params) as ActionRow[]
}

export interface ActionTopicRow { action: string; topic: string; count: number }
export function queryActionTopicCombinations(db: Database.Database): ActionTopicRow[] {
  return db.prepare(`
    SELECT action, topic, COUNT(*) as count
    FROM contributions
    WHERE action IS NOT NULL AND topic IS NOT NULL
    GROUP BY action, topic
    ORDER BY count DESC
    LIMIT 25
  `).all() as ActionTopicRow[]
}

export interface TopicSatisfactionRow {
  topic: string
  session_count: number
  avg_satisfaction: number
}
export function queryTopicSatisfaction(db: Database.Database): TopicSatisfactionRow[] {
  // Join contributions (for topic) with sessions (for satisfaction)
  // Group by topic, average the satisfaction score
  return db.prepare(`
    SELECT c.topic, COUNT(DISTINCT s.session_id) as session_count,
      ROUND(AVG(s.satisfaction_score)) as avg_satisfaction
    FROM contributions c
    JOIN sessions s ON c.session_id = s.session_id
    WHERE c.topic IS NOT NULL AND s.satisfaction_score IS NOT NULL
    GROUP BY c.topic
    HAVING session_count >= 1
    ORDER BY session_count DESC
  `).all() as TopicSatisfactionRow[]
}

// --- Satisfaction queries ---

export interface SatisfactionByIntentRow {
  dominant_intent: string
  session_count: number
  avg_satisfaction: number
}
export function querySatisfactionByIntent(db: Database.Database): SatisfactionByIntentRow[] {
  return db.prepare(`
    SELECT dominant_intent, COUNT(*) as session_count,
      ROUND(AVG(satisfaction_score)) as avg_satisfaction
    FROM sessions
    WHERE dominant_intent IS NOT NULL AND satisfaction_score IS NOT NULL
    GROUP BY dominant_intent
    ORDER BY session_count DESC
  `).all() as SatisfactionByIntentRow[]
}

// --- Network Stats (cross-contributor aggregates) ---

export interface NetworkStats {
  totalContributors: number
  totalSessions: number
  avgSatisfaction: number
}

export function queryNetworkStats(db: Database.Database): NetworkStats {
  const row = db.prepare(`
    SELECT
      COUNT(DISTINCT contributor_id) as total_contributors,
      COUNT(*) as total_sessions,
      ROUND(AVG(CASE WHEN satisfaction_score IS NOT NULL THEN satisfaction_score END)) as avg_satisfaction
    FROM sessions
  `).get() as { total_contributors: number; total_sessions: number; avg_satisfaction: number | null }

  return {
    totalContributors: row.total_contributors,
    totalSessions: row.total_sessions,
    avgSatisfaction: row.avg_satisfaction ?? 0,
  }
}

export interface ContributorRow {
  contributor_id: string
  session_count: number
  avg_satisfaction: number
}

export function queryTopContributors(db: Database.Database, limit = 10): ContributorRow[] {
  return db.prepare(`
    SELECT
      contributor_id,
      COUNT(*) as session_count,
      ROUND(AVG(CASE WHEN satisfaction_score IS NOT NULL THEN satisfaction_score END)) as avg_satisfaction
    FROM sessions
    WHERE contributor_id IS NOT NULL
    GROUP BY contributor_id
    ORDER BY session_count DESC
    LIMIT ?
  `).all(limit) as ContributorRow[]
}

// --- Network Trends (daily aggregates for sparklines) ---

export interface NetworkTrendRow {
  date: string
  session_count: number
  contributor_count: number
  avg_satisfaction: number | null
  avg_prompts_per_session: number
  completion_rate: number
}

export function queryNetworkTrends(db: Database.Database, days = 7): NetworkTrendRow[] {
  const cutoff = Date.now() - days * MS_PER_DAY
  return db.prepare(`
    SELECT
      date(started_at / 1000, 'unixepoch') as date,
      COUNT(*) as session_count,
      COUNT(DISTINCT contributor_id) as contributor_count,
      ROUND(AVG(CASE WHEN satisfaction_score IS NOT NULL THEN satisfaction_score END)) as avg_satisfaction,
      ROUND(1.0 * SUM(prompt_count) / COUNT(*), 1) as avg_prompts_per_session,
      ROUND(100.0 * SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) / COUNT(*)) as completion_rate
    FROM sessions
    WHERE started_at > ?
    GROUP BY date
    ORDER BY date
  `).all(cutoff) as NetworkTrendRow[]
}

// --- Network Peak Hours (cross-contributor time-of-day distribution) ---

export interface NetworkHourRow {
  hour_bucket: string
  count: number
}

export function queryNetworkPeakHours(db: Database.Database): NetworkHourRow[] {
  return db.prepare(`
    SELECT hour_bucket, COUNT(*) as count
    FROM contributions
    WHERE hour_bucket IS NOT NULL
    GROUP BY hour_bucket
    ORDER BY CASE hour_bucket
      WHEN 'morning' THEN 1
      WHEN 'afternoon' THEN 2
      WHEN 'evening' THEN 3
      WHEN 'night' THEN 4
    END
  `).all() as NetworkHourRow[]
}

// --- Network Intent + Domain Mix ---

export interface NetworkIntentRow { intent: string; count: number }
export function queryNetworkIntentMix(db: Database.Database): NetworkIntentRow[] {
  return db.prepare(`
    SELECT dominant_intent as intent, COUNT(*) as count
    FROM sessions
    WHERE dominant_intent IS NOT NULL
    GROUP BY dominant_intent
    ORDER BY count DESC
  `).all() as NetworkIntentRow[]
}

export interface NetworkActivityRow { intent: string; domain: string; count: number }
export function queryNetworkActivityMix(db: Database.Database): NetworkActivityRow[] {
  return db.prepare(`
    SELECT dominant_intent as intent, dominant_domain as domain, COUNT(*) as count
    FROM sessions
    WHERE dominant_intent IS NOT NULL AND dominant_domain IS NOT NULL
    GROUP BY dominant_intent, dominant_domain
    ORDER BY count DESC
  `).all() as NetworkActivityRow[]
}

export interface NetworkDomainRow { domain: string; count: number }
export function queryNetworkDomainMix(db: Database.Database): NetworkDomainRow[] {
  return db.prepare(`
    SELECT dominant_domain as domain, COUNT(*) as count
    FROM sessions
    WHERE dominant_domain IS NOT NULL
    GROUP BY dominant_domain
    ORDER BY count DESC
  `).all() as NetworkDomainRow[]
}

// --- Developer Behavior (v4 aggregate) ---

export interface DeveloperBehavior {
  avgSearchToEditRatio: number
  avgErrorRecoveryRate: number
  mcpEngagementPercent: number
  avgToolsPerSession: number
  subagentSessionPercent: number
  compactionSessionPercent: number
}

export function queryDeveloperBehavior(db: Database.Database): DeveloperBehavior {
  const row = db.prepare(`
    SELECT
      ROUND(AVG(CASE WHEN search_to_edit_ratio IS NOT NULL THEN search_to_edit_ratio END), 1) as avg_ser,
      ROUND(AVG(CASE WHEN error_recovery_rate IS NOT NULL THEN error_recovery_rate END) * 100) as avg_err,
      ROUND(100.0 * SUM(CASE WHEN mcp_tool_count > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) as mcp_pct,
      ROUND(AVG(tool_use_count)) as avg_tools,
      ROUND(100.0 * SUM(CASE WHEN subagent_count > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) as sub_pct,
      ROUND(100.0 * SUM(CASE WHEN context_compactions > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) as compact_pct
    FROM sessions
  `).get() as {
    avg_ser: number | null
    avg_err: number | null
    mcp_pct: number | null
    avg_tools: number | null
    sub_pct: number | null
    compact_pct: number | null
  }

  return {
    avgSearchToEditRatio: row.avg_ser ?? 0,
    avgErrorRecoveryRate: row.avg_err ?? 0,
    mcpEngagementPercent: row.mcp_pct ?? 0,
    avgToolsPerSession: row.avg_tools ?? 0,
    subagentSessionPercent: row.sub_pct ?? 0,
    compactionSessionPercent: row.compact_pct ?? 0,
  }
}

// --- Interactive dashboard queries ---

export interface SessionSummaryFullRow {
  session_id: string
  started_at: number
  ended_at: number | null
  duration_bucket: string | null
  prompt_count: number
  tool_use_count: number
  tool_failure_count: number
  dominant_intent: string | null
  dominant_domain: string | null
  outcome: string | null
  satisfaction_score: number | null
  subject: string | null
  languages_used: string | null
  unique_tools: string | null
  mcp_servers_used: string | null
  permission_mode: string | null
  mcp_tool_count: number
  unique_mcp_servers: number
  subagent_count: number
  context_compactions: number
  edit_count: number
  read_count: number
  search_to_edit_ratio: number | null
  error_recovery_rate: number | null
}

export function querySessionSummariesFull(db: Database.Database, limit = 100): SessionSummaryFullRow[] {
  return db.prepare(`
    SELECT session_id, started_at, ended_at, duration_bucket,
      prompt_count, tool_use_count, tool_failure_count,
      dominant_intent, dominant_domain, outcome,
      satisfaction_score, subject, languages_used, unique_tools, mcp_servers_used,
      permission_mode, mcp_tool_count, unique_mcp_servers,
      subagent_count, context_compactions,
      edit_count, read_count, search_to_edit_ratio, error_recovery_rate
    FROM sessions
    ORDER BY started_at DESC
    LIMIT ?
  `).all(limit) as SessionSummaryFullRow[]
}

export function querySessionContributions(
  db: Database.Database, sessionId: string
): Record<string, unknown>[] {
  return db.prepare(
    'SELECT * FROM contributions WHERE session_id = ? ORDER BY timestamp'
  ).all(sessionId) as Record<string, unknown>[]
}

export interface SessionToolSummaryRow {
  tool_name: string
  count: number
  success_count: number
}

export function querySessionToolSummary(
  db: Database.Database, sessionId: string
): SessionToolSummaryRow[] {
  return db.prepare(`
    SELECT tool_name, COUNT(*) as count,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count
    FROM tool_events WHERE session_id = ?
    GROUP BY tool_name ORDER BY count DESC
  `).all(sessionId) as SessionToolSummaryRow[]
}

export interface FieldCountRow {
  value: string
  count: number
}

export function querySessionFieldCounts(
  db: Database.Database, sessionId: string, field: string
): FieldCountRow[] {
  const allowed = ['intent', 'complexity', 'prompt_style', 'domain', 'action', 'topic']
  if (!allowed.includes(field)) return []
  return db.prepare(`
    SELECT ${field} as value, COUNT(*) as count
    FROM contributions WHERE session_id = ? AND ${field} IS NOT NULL
    GROUP BY ${field} ORDER BY count DESC
  `).all(sessionId) as FieldCountRow[]
}

// --- Live stream + today stats (Mission Control) ---

export interface RecentContributionRow {
  timestamp: number
  session_id: string | null
  intent: string | null
  domain: string | null
  action: string | null
  topic: string | null
  tools_chain: string | null
}

export function queryRecentContributions(db: Database.Database, limit = 30): RecentContributionRow[] {
  return db.prepare(`
    SELECT timestamp, session_id, intent, domain, action, topic, tools_chain
    FROM contributions
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit) as RecentContributionRow[]
}

export interface TodayStats {
  promptsToday: number
  sessionsToday: number
  toolCallsToday: number
}

export function queryTodayStats(db: Database.Database): TodayStats {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  const contribRow = db.prepare(`
    SELECT COUNT(*) as prompts, COUNT(DISTINCT session_id) as sessions
    FROM contributions
    WHERE timestamp > ?
  `).get(startOfDay) as { prompts: number; sessions: number }

  const toolRow = db.prepare(`
    SELECT COUNT(*) as tools
    FROM tool_events
    WHERE timestamp > ?
  `).get(startOfDay) as { tools: number }

  return {
    promptsToday: contribRow.prompts,
    sessionsToday: contribRow.sessions,
    toolCallsToday: toolRow.tools,
  }
}

// --- Today's Activity Feed (Mission Control) ---

export interface TodayActivityRow {
  action: string
  topic: string
  count: number
}

export function queryTodayActivity(db: Database.Database): TodayActivityRow[] {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

  return db.prepare(`
    SELECT action, topic, COUNT(*) as count
    FROM contributions
    WHERE timestamp > ? AND action IS NOT NULL AND topic IS NOT NULL
    GROUP BY action, topic
    ORDER BY count DESC
    LIMIT 8
  `).all(startOfDay) as TodayActivityRow[]
}

// --- Session feed (Mission Control hybrid) ---

export interface ActiveSessionRow {
  session_id: string
  started_at: number
  subject: string | null
  dominant_intent: string | null
  dominant_domain: string | null
  prompt_count: number
  tool_use_count: number
}

export function queryActiveSession(db: Database.Database): ActiveSessionRow | null {
  // Most recent session with no end time = still running
  const row = db.prepare(`
    SELECT session_id, started_at, subject, dominant_intent, dominant_domain,
      prompt_count, tool_use_count
    FROM sessions
    WHERE ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
  `).get() as ActiveSessionRow | undefined

  if (!row) return null

  // Get live counts from contributions/tool_events (more up-to-date than session record)
  const livePrompts = db.prepare(
    'SELECT COUNT(*) as c FROM contributions WHERE session_id = ?'
  ).get(row.session_id) as { c: number }
  const liveTools = db.prepare(
    'SELECT COUNT(*) as c FROM tool_events WHERE session_id = ?'
  ).get(row.session_id) as { c: number }

  return {
    ...row,
    prompt_count: Math.max(row.prompt_count, livePrompts.c),
    tool_use_count: Math.max(row.tool_use_count, liveTools.c),
  }
}

export interface CompletedSessionRow {
  session_id: string
  started_at: number
  ended_at: number
  subject: string | null
  dominant_intent: string | null
  prompt_count: number
  tool_use_count: number
  satisfaction_score: number | null
}

export function queryCompletedSessions(db: Database.Database, limit = 15): CompletedSessionRow[] {
  return db.prepare(`
    SELECT session_id, started_at, ended_at, subject, dominant_intent,
      prompt_count, tool_use_count, satisfaction_score
    FROM sessions
    WHERE ended_at IS NOT NULL
    ORDER BY started_at DESC
    LIMIT ?
  `).all(limit) as CompletedSessionRow[]
}

// --- Vibecoder Profile queries ---

export interface VibecoderDNARow {
  dominant_intent: string
  count: number
}

export function queryVibecoderDNA(db: Database.Database, contributorId: string): VibecoderDNARow[] {
  return db.prepare(`
    SELECT dominant_intent, COUNT(*) as count
    FROM sessions
    WHERE contributor_id = ? AND dominant_intent IS NOT NULL
    GROUP BY dominant_intent
    ORDER BY count DESC
  `).all(contributorId) as VibecoderDNARow[]
}

export interface ContributorAggregateRow {
  contributor_id: string
  session_count: number
  avg_prompts: number
  avg_tools: number
  max_mcp_servers: number
  avg_satisfaction: number | null
}

export function queryAllContributorAggregates(db: Database.Database): ContributorAggregateRow[] {
  return db.prepare(`
    SELECT
      contributor_id,
      COUNT(*) as session_count,
      ROUND(AVG(prompt_count), 1) as avg_prompts,
      ROUND(AVG(tool_use_count), 1) as avg_tools,
      MAX(COALESCE(unique_mcp_servers, 0)) as max_mcp_servers,
      ROUND(AVG(CASE WHEN satisfaction_score IS NOT NULL THEN satisfaction_score END)) as avg_satisfaction
    FROM sessions
    WHERE contributor_id IS NOT NULL
    GROUP BY contributor_id
  `).all() as ContributorAggregateRow[]
}

export interface SatisfactionOverviewRow {
  avg_score: number
  scored_sessions: number
  total_sessions: number
  signal_counts: Record<string, number>
}
export function querySatisfactionOverview(db: Database.Database): SatisfactionOverviewRow {
  const avg = db.prepare(`
    SELECT ROUND(AVG(satisfaction_score)) as avg_score,
      COUNT(*) as scored_sessions
    FROM sessions WHERE satisfaction_score IS NOT NULL
  `).get() as { avg_score: number | null; scored_sessions: number }

  const total = db.prepare('SELECT COUNT(*) as c FROM sessions').get() as { c: number }

  // Aggregate signal counts from JSON
  const signalRows = db.prepare(`
    SELECT satisfaction_signals FROM sessions
    WHERE satisfaction_signals IS NOT NULL
  `).all() as { satisfaction_signals: string }[]

  const signalCounts: Record<string, number> = {}
  for (const row of signalRows) {
    try {
      const signals = JSON.parse(row.satisfaction_signals) as Record<string, boolean>
      for (const [key, value] of Object.entries(signals)) {
        if (value) signalCounts[key] = (signalCounts[key] ?? 0) + 1
      }
    } catch { /* skip malformed */ }
  }

  return {
    avg_score: avg.avg_score ?? 0,
    scored_sessions: avg.scored_sessions,
    total_sessions: total.c,
    signal_counts: signalCounts,
  }
}
