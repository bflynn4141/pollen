import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  buildNetworkDashboard,
  type NetworkApiResponse,
  type NetworkDashboard,
  type NetworkPeriodSnapshot,
  type RankingWindow,
} from './network-dashboard'

const DAY = 86_400_000
const WINDOW_MS: Record<RankingWindow, number> = {
  '24h': DAY,
  '7d': 7 * DAY,
  '30d': 30 * DAY,
}

interface LocalSession {
  session_id: string
  source: string | null
  model: string | null
  started_at: number
  outcome: string | null
  input_tokens: number | null
  output_tokens: number | null
  cached_input_tokens: number | null
  reasoning_tokens: number | null
}

interface LocalContribution {
  session_id: string | null
  timestamp: number
  intent: string | null
}

interface LocalToolEvent {
  session_id: string
  timestamp: number
  tool_name: string
  tool_category: string
  success: number
  mcp_server: string | null
  duration_ms: number | null
  sequence_number: number
  attributed_input_tokens?: number | null
  attributed_output_tokens?: number | null
  attributed_cached_input_tokens?: number | null
  attributed_reasoning_tokens?: number | null
}

export interface PersonalActivityRows {
  sessions: LocalSession[]
  contributions: LocalContribution[]
  tools: LocalToolEvent[]
}

function sqliteRows<T>(databasePath: string, sql: string): T[] {
  const output = execFileSync('sqlite3', ['-json', databasePath, sql], {
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 50 * 1024 * 1024,
  }).trim()
  return output ? JSON.parse(output) as T[] : []
}

export function readPersonalActivity(
  databasePath = process.env.POLLEN_DB_PATH ?? join(homedir(), '.pollen', 'local.db'),
  now = Date.now(),
): PersonalActivityRows {
  if (!existsSync(databasePath)) return { sessions: [], contributions: [], tools: [] }
  const cutoff = now - 60 * DAY
  return {
    sessions: sqliteRows<LocalSession>(databasePath, `
      SELECT session_id, source, model, started_at, outcome,
             input_tokens, output_tokens, cached_input_tokens, reasoning_tokens
      FROM sessions
      WHERE started_at >= ${cutoff}
    `),
    contributions: sqliteRows<LocalContribution>(databasePath, `
      SELECT session_id, timestamp, intent
      FROM contributions
      WHERE timestamp >= ${cutoff}
    `),
    tools: sqliteRows<LocalToolEvent>(databasePath, `
      SELECT session_id, timestamp, tool_name, tool_category, success,
             mcp_server, duration_ms, sequence_number,
             attributed_input_tokens, attributed_output_tokens,
             attributed_cached_input_tokens, attributed_reasoning_tokens
      FROM tool_events
      WHERE timestamp >= ${cutoff}
    `),
  }
}

const round4 = (value: number) => Math.round(value * 10_000) / 10_000
const ratio = <T>(items: T[], predicate: (item: T) => boolean) => (
  items.length ? round4(items.filter(predicate).length / items.length) : 0
)

function latencyBucket(values: Array<number | null>): string {
  const durations = values.filter((value): value is number => value != null && value >= 0).sort((a, b) => a - b)
  if (!durations.length) return 'unknown'
  const median = durations[Math.floor(durations.length / 2)]
  if (median < 250) return 'instant'
  if (median < 1_000) return 'fast'
  if (median < 5_000) return 'moderate'
  if (median < 30_000) return 'slow'
  return 'very_slow'
}

const OPAQUE_MCP_SERVER = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function canonicalMcpServer(value: string, toolNames: string[] = []): string {
  const normalized = value.trim().toLowerCase().replaceAll('_', '-').replace(/[^a-z0-9-]+/g, '-')
  if (OPAQUE_MCP_SERVER.test(normalized)) {
    const names = toolNames.join(' ').toLowerCase()
    if (names.includes('notion')) return 'notion'
    if (names.includes('gmail')) return 'gmail'
    if (names.includes('google-calendar')) return 'google-calendar'
  }
  return normalized.slice(0, 48) || 'unknown'
}

function canonicalMcpTool(server: string, value: string): string {
  const raw = value.split('__').at(-1) ?? value
  return raw.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 64) || 'unknown'
}

function attributedTokens(group: LocalToolEvent[]) {
  const measured = group.filter(tool =>
    tool.attributed_input_tokens != null || tool.attributed_output_tokens != null
  )
  if (!measured.length) return {}
  const reasoningMeasured = group.filter(tool => tool.attributed_reasoning_tokens != null)
  return {
    inputTokens: measured.reduce((sum, tool) => sum + (tool.attributed_input_tokens ?? 0), 0),
    outputTokens: measured.reduce((sum, tool) => sum + (tool.attributed_output_tokens ?? 0), 0),
    cachedInputTokens: measured.reduce((sum, tool) => sum + (tool.attributed_cached_input_tokens ?? 0), 0),
    ...(reasoningMeasured.length ? {
      reasoningTokens: reasoningMeasured.reduce((sum, tool) => sum + (tool.attributed_reasoning_tokens ?? 0), 0),
    } : {}),
    tokenizedEvents: measured.length,
  }
}

function buildSnapshot(rows: PersonalActivityRows, start: number, end: number): NetworkPeriodSnapshot | null {
  const sessions = rows.sessions.filter(row => row.started_at >= start && row.started_at < end)
  const contributions = rows.contributions.filter(row => row.timestamp >= start && row.timestamp < end && row.intent)
  const tools = rows.tools.filter(row => row.timestamp >= start && row.timestamp < end)
  if (!sessions.length && !contributions.length && !tools.length) return null

  const sessionsById = new Map(sessions.map(session => [session.session_id, session]))
  const overallToolSuccess = ratio(tools, tool => tool.success === 1)
  const toolSuccessForSessions = (sessionIds: Iterable<string>) => {
    const ids = new Set(sessionIds)
    const relevant = tools.filter(tool => ids.has(tool.session_id))
    return relevant.length ? ratio(relevant, tool => tool.success === 1) : overallToolSuccess
  }
  const models = new Map<string, { agent: string; model: string; rows: LocalSession[] }>()
  for (const session of sessions) {
    const agent = session.source?.includes('claude') ? 'claude-code'
      : session.source?.includes('codex') ? 'codex'
        : session.source ?? 'unknown'
    // Agent identity is not a model. Keep unattributed sessions in overview
    // totals, but exclude them from model rankings instead of inventing a
    // misleading "Claude Code" model row.
    if (!session.model) continue
    const model = session.model
    const key = `${agent}\0${model}`
    const group = models.get(key) ?? { agent, model, rows: [] }
    group.rows.push(session)
    models.set(key, group)
  }

  const categories = new Map<string, LocalToolEvent[]>()
  const mcpServers = new Map<string, LocalToolEvent[]>()
  const mcpTools = new Map<string, { server: string; tool: string; rows: LocalToolEvent[] }>()
  const mcpToolNames = new Map<string, string[]>()
  for (const tool of tools) {
    if (!tool.mcp_server) continue
    const names = mcpToolNames.get(tool.mcp_server) ?? []
    names.push(tool.tool_name)
    mcpToolNames.set(tool.mcp_server, names)
  }
  for (const tool of tools) {
    const categoryRows = categories.get(tool.tool_category) ?? []
    categoryRows.push(tool)
    categories.set(tool.tool_category, categoryRows)
    if (!tool.mcp_server) continue
    const server = canonicalMcpServer(tool.mcp_server, mcpToolNames.get(tool.mcp_server))
    const serverRows = mcpServers.get(server) ?? []
    serverRows.push(tool)
    mcpServers.set(server, serverRows)
    const name = canonicalMcpTool(server, tool.tool_name)
    const key = `${server}\0${name}`
    const toolGroup = mcpTools.get(key) ?? { server, tool: name, rows: [] }
    toolGroup.rows.push(tool)
    mcpTools.set(key, toolGroup)
  }

  const intents = new Map<string, LocalContribution[]>()
  for (const contribution of contributions) {
    const intent = contribution.intent!
    const group = intents.get(intent) ?? []
    group.push(contribution)
    intents.set(intent, group)
  }

  const toolsBySession = new Map<string, LocalToolEvent[]>()
  for (const tool of tools) {
    const group = toolsBySession.get(tool.session_id) ?? []
    group.push(tool)
    toolsBySession.set(tool.session_id, group)
  }
  const workflows = new Map<string, { sequence: string[]; sessions: LocalSession[] }>()
  for (const session of sessions) {
    const ordered = (toolsBySession.get(session.session_id) ?? [])
      .sort((left, right) => left.sequence_number - right.sequence_number || left.timestamp - right.timestamp)
      .map(tool => tool.tool_category)
      .filter(category => category && category !== 'unknown')
    const sequence = ordered.filter((category, index) => category !== ordered[index - 1]).slice(0, 6)
    if (sequence.length < 2) continue
    const key = sequence.join('>')
    const group = workflows.get(key) ?? { sequence, sessions: [] }
    group.sessions.push(session)
    workflows.set(key, group)
  }

  return {
    period: `${new Date(start).toISOString()} → ${new Date(end).toISOString()}`,
    overview: {
      period: `${new Date(start).toISOString()} → ${new Date(end).toISOString()}`,
      sessions: sessions.length,
      categoryEvents: tools.length,
      completionRate: overallToolSuccess,
      checkPassRate: overallToolSuccess,
      contributors: 1,
    },
    models: [...models.values()].map(group => {
      const measured = group.rows.filter(row => row.input_tokens != null || row.output_tokens != null)
      const reasoningMeasured = group.rows.filter(row => row.reasoning_tokens != null)
      return {
        agent: group.agent,
        model: group.model,
        sessions: group.rows.length,
        ...(measured.length ? {
          inputTokens: measured.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0),
          outputTokens: measured.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0),
          cachedInputTokens: measured.reduce((sum, row) => sum + (row.cached_input_tokens ?? 0), 0),
          tokenizedSessions: measured.length,
          reasoningSessions: reasoningMeasured.length,
          ...(reasoningMeasured.length ? {
            reasoningTokens: reasoningMeasured.reduce((sum, row) => sum + (row.reasoning_tokens ?? 0), 0),
          } : {}),
        } : {}),
        completionRate: toolSuccessForSessions(group.rows.map(session => session.session_id)),
        checkPassRate: toolSuccessForSessions(group.rows.map(session => session.session_id)),
        contributors: 1,
      }
    }),
    toolCategories: [...categories].map(([category, group]) => ({
      category,
      events: group.length,
      calls: group.length,
      ...attributedTokens(group),
      sessions: new Set(group.map(item => item.session_id)).size,
      completionRate: ratio(group, tool => tool.success === 1),
      checkPassRate: ratio(group, tool => tool.success === 1),
      contributors: 1,
    })),
    mcpServers: [...mcpServers].map(([server, group]) => ({
      server,
      calls: group.length,
      ...attributedTokens(group),
      sessions: new Set(group.map(item => item.session_id)).size,
      successRate: ratio(group, tool => tool.success === 1),
      latencyBucket: latencyBucket(group.map(tool => tool.duration_ms)),
      contributors: 1,
    })),
    mcpTools: [...mcpTools.values()].map(group => ({
      server: group.server,
      tool: group.tool,
      calls: group.rows.length,
      ...attributedTokens(group.rows),
      sessions: new Set(group.rows.map(item => item.session_id)).size,
      successRate: ratio(group.rows, tool => tool.success === 1),
      latencyBucket: latencyBucket(group.rows.map(tool => tool.duration_ms)),
      contributors: 1,
    })),
    intents: [...intents].map(([intent, group]) => {
      const linked = [...new Set(group.flatMap(item => item.session_id ? [item.session_id] : []))]
        .flatMap(id => sessionsById.get(id) ? [sessionsById.get(id)!] : [])
      return {
        intent,
        sessions: group.length,
        completionRate: linked.length ? toolSuccessForSessions(linked.map(session => session.session_id)) : overallToolSuccess,
        checkPassRate: linked.length ? toolSuccessForSessions(linked.map(session => session.session_id)) : overallToolSuccess,
        contributors: 1,
      }
    }),
    workflows: [...workflows.values()].map(group => ({
      sequence: group.sequence,
      sessions: group.sessions.length,
      completionRate: toolSuccessForSessions(group.sessions.map(session => session.session_id)),
      checkPassRate: toolSuccessForSessions(group.sessions.map(session => session.session_id)),
      contributors: 1,
    })),
  }
}

export function buildPersonalDashboard(rows: PersonalActivityRows, now = Date.now()): NetworkDashboard {
  const windows = Object.fromEntries(Object.entries(WINDOW_MS).map(([id, duration]) => [id, {
    current: buildSnapshot(rows, now - duration, now),
    previous: buildSnapshot(rows, now - 2 * duration, now - duration),
  }])) as NetworkApiResponse['windows']
  const response: NetworkApiResponse = {
    source: 'local_activity',
    scope: 'personal',
    k_anonymity: 1,
    status: Object.values(windows).some(window => window.current !== null) ? 'live' : 'warming_up',
    windows,
  }
  return buildNetworkDashboard(response)
}

export function fetchPersonalDashboard(): NetworkDashboard {
  return buildPersonalDashboard(readPersonalActivity())
}
