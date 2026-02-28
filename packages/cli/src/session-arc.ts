import type Database from 'better-sqlite3'
import type { DurationBucket, SessionOutcome, Intent, Domain, SatisfactionSignals } from './types.js'

export function computeDurationBucket(startedAt: number, endedAt: number): DurationBucket {
  const minutes = (endedAt - startedAt) / 60000

  if (minutes < 5) return 'quick'
  if (minutes < 15) return 'short'
  if (minutes < 60) return 'medium'
  if (minutes < 180) return 'long'
  return 'marathon'
}

export function computeOutcome(
  toolFailureCount: number,
  toolUseCount: number,
  promptCount: number,
): SessionOutcome {
  // If a high percentage of tool uses failed, likely error exit
  if (toolUseCount > 0 && toolFailureCount / toolUseCount > 0.5) return 'error_exit'

  // Very short sessions with no tool use likely abandoned
  if (promptCount <= 1 && toolUseCount === 0) return 'abandoned'

  return 'completed'
}

interface ArcData {
  prompt_count: number
  tool_use_count: number
  tool_failure_count: number
  intents: string[]
  domains: string[]
  tools: string[]
  languages: string[]
  mcp_servers: string[]
  has_git_activity: boolean
  has_retry_storm: boolean
}

export function gatherSessionArcData(db: Database.Database, sessionId: string): ArcData {
  // Count prompts
  const promptRow = db.prepare(
    'SELECT COUNT(*) as count FROM contributions WHERE session_id = ?'
  ).get(sessionId) as { count: number }

  // Count tool events
  const toolRow = db.prepare(
    'SELECT COUNT(*) as total, SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures FROM tool_events WHERE session_id = ?'
  ).get(sessionId) as { total: number; failures: number }

  // Gather intents from contributions
  const intentRows = db.prepare(
    'SELECT intent FROM contributions WHERE session_id = ? ORDER BY timestamp'
  ).all(sessionId) as { intent: string }[]

  // Gather domains
  const domainRows = db.prepare(
    'SELECT domain FROM contributions WHERE session_id = ?'
  ).all(sessionId) as { domain: string }[]

  // Gather unique tools from tool_events
  const toolRows = db.prepare(
    'SELECT DISTINCT tool_name FROM tool_events WHERE session_id = ?'
  ).all(sessionId) as { tool_name: string }[]

  // Gather languages from contributions
  const langRows = db.prepare(`
    SELECT DISTINCT value as lang
    FROM contributions, json_each(contributions.language_signals)
    WHERE contributions.session_id = ?
  `).all(sessionId) as { lang: string }[]

  // Gather MCP servers from tool_events
  const mcpRows = db.prepare(
    'SELECT DISTINCT mcp_server FROM tool_events WHERE session_id = ? AND mcp_server IS NOT NULL'
  ).all(sessionId) as { mcp_server: string }[]

  // Check for git activity (any git command in this session)
  const gitRow = db.prepare(
    "SELECT COUNT(*) as c FROM tool_events WHERE session_id = ? AND command_category = 'git'"
  ).get(sessionId) as { c: number }

  // Check for retry storms: same tool failing 3+ times in a row
  const failureSeq = db.prepare(
    'SELECT tool_name, success FROM tool_events WHERE session_id = ? ORDER BY sequence_number'
  ).all(sessionId) as { tool_name: string; success: number }[]

  let hasRetryStorm = false
  let consecutiveFails = 0
  let lastFailTool = ''
  for (const row of failureSeq) {
    if (row.success === 0 && row.tool_name === lastFailTool) {
      consecutiveFails++
      if (consecutiveFails >= 3) { hasRetryStorm = true; break }
    } else if (row.success === 0) {
      lastFailTool = row.tool_name
      consecutiveFails = 1
    } else {
      consecutiveFails = 0
      lastFailTool = ''
    }
  }

  return {
    prompt_count: promptRow.count,
    tool_use_count: toolRow.total,
    tool_failure_count: toolRow.failures ?? 0,
    intents: intentRows.map(r => r.intent),
    domains: domainRows.map(r => r.domain),
    tools: toolRows.map(r => r.tool_name),
    languages: langRows.map(r => r.lang),
    mcp_servers: mcpRows.map(r => r.mcp_server),
    has_git_activity: gitRow.c > 0,
    has_retry_storm: hasRetryStorm,
  }
}

function mostFrequent<T>(items: T[]): T | null {
  if (items.length === 0) return null
  const counts = new Map<T, number>()
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1)
  }
  let best: T | null = null
  let bestCount = 0
  for (const [item, count] of counts) {
    if (count > bestCount) {
      best = item
      bestCount = count
    }
  }
  return best
}

export function computeSatisfactionScore(
  data: ArcData,
  outcome: SessionOutcome,
  durationMinutes: number,
): { score: number; signals: SatisfactionSignals } {
  const failureRate = data.tool_use_count > 0
    ? data.tool_failure_count / data.tool_use_count
    : 0

  const dominantIntent = mostFrequent(data.intents)
  const dominantCount = dominantIntent
    ? data.intents.filter(i => i === dominantIntent).length
    : 0
  const intentConsistency = data.intents.length > 0
    ? dominantCount / data.intents.length
    : 0

  const signals: SatisfactionSignals = {
    git_activity: data.has_git_activity,
    low_failure_rate: failureRate < 0.2,
    no_retry_storms: !data.has_retry_storm,
    reasonable_duration: durationMinutes > 2 && durationMinutes < 240,
    tool_engagement: data.tool_use_count > 0,
    consistent_intent: intentConsistency > 0.5,
    clean_ending: outcome === 'completed',
  }

  let score = 0
  if (signals.git_activity) score += 15
  if (signals.low_failure_rate) score += 25
  if (signals.no_retry_storms) score += 15
  if (signals.reasonable_duration) score += 10
  if (signals.tool_engagement) score += 15
  if (signals.consistent_intent) score += 10
  if (signals.clean_ending) score += 10

  return { score, signals }
}

export function computeSessionArc(
  db: Database.Database,
  sessionId: string,
  startedAt: number,
  endedAt: number,
): {
  duration_bucket: DurationBucket
  prompt_count: number
  tool_use_count: number
  tool_failure_count: number
  intent_sequence: string
  dominant_intent: Intent | null
  dominant_domain: Domain | null
  unique_tools: string
  languages_used: string
  outcome: SessionOutcome
  satisfaction_score: number
  satisfaction_signals: string
} {
  const data = gatherSessionArcData(db, sessionId)
  const outcome = computeOutcome(data.tool_failure_count, data.tool_use_count, data.prompt_count)
  const durationMinutes = (endedAt - startedAt) / 60000
  const satisfaction = computeSatisfactionScore(data, outcome, durationMinutes)

  return {
    duration_bucket: computeDurationBucket(startedAt, endedAt),
    prompt_count: data.prompt_count,
    tool_use_count: data.tool_use_count,
    tool_failure_count: data.tool_failure_count,
    intent_sequence: JSON.stringify(data.intents),
    dominant_intent: mostFrequent(data.intents) as Intent | null,
    dominant_domain: mostFrequent(data.domains) as Domain | null,
    unique_tools: JSON.stringify(data.tools),
    languages_used: JSON.stringify(data.languages),
    outcome,
    satisfaction_score: satisfaction.score,
    satisfaction_signals: JSON.stringify(satisfaction.signals),
  }
}
