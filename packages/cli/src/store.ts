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
  topic TEXT
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
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tool_session ON tool_events(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_name ON tool_events(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_timestamp ON tool_events(timestamp);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  model TEXT,
  source TEXT,
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
  subject TEXT
);

CREATE INDEX IF NOT EXISTS idx_session_started ON sessions(started_at);
`

export function initDb(dbPath?: string): Database.Database {
  const db = dbPath ? new Database(dbPath) : new Database(':memory:')
  db.pragma('journal_mode = WAL')
  // Migrate existing tables first (adds new columns), then create schema
  // (CREATE TABLE IF NOT EXISTS is a no-op for existing tables, but
  //  CREATE INDEX on new columns needs the columns to exist first)
  migrateSchema(db)
  db.exec(SCHEMA)
  return db
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
      action, topic
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?
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
  db.prepare(`
    INSERT INTO tool_events (
      id, session_id, timestamp, tool_name, tool_category,
      success, error_category, file_extension, command_category, sequence_number,
      mcp_server, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      session_id, model, source, started_at, ended_at,
      duration_bucket, prompt_count, tool_use_count, tool_failure_count,
      intent_sequence, dominant_intent, dominant_domain,
      unique_tools, languages_used, outcome,
      project_type, end_reason, mcp_servers_used, response_count, avg_response_length,
      satisfaction_score, satisfaction_signals, subject
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.session_id,
    session.model,
    session.source,
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
    'subject',
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
}

export function querySessionSummariesFull(db: Database.Database, limit = 100): SessionSummaryFullRow[] {
  return db.prepare(`
    SELECT session_id, started_at, ended_at, duration_bucket,
      prompt_count, tool_use_count, tool_failure_count,
      dominant_intent, dominant_domain, outcome,
      satisfaction_score, subject, languages_used, unique_tools, mcp_servers_used
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
