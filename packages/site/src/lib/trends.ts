// Shared types for the /api/trends/* responses

export type Period = '7d' | '30d' | '90d' | 'all'

export interface TimePoint {
  date: string
  count: number
}

export interface TopicTimePoint {
  date: string
  [topic: string]: string | number // date + dynamic topic keys
}

export interface OverviewResponse {
  totalPrompts: number
  totalSessions: number
  totalToolEvents: number
  avgSatisfaction: number | null
  topTopic: { name: string; count: number } | null
  topAction: { name: string; count: number } | null
  topTool: { name: string; count: number } | null
  sparkline: TimePoint[]
}

export interface TopicTrendItem {
  topic: string
  total: number
  series: TimePoint[]
}

export interface TopicsResponse {
  topics: TopicTrendItem[]
}

export interface ActionTrendItem {
  action: string
  total: number
  series: TimePoint[]
}

export interface ActionsResponse {
  actions: ActionTrendItem[]
}

export interface ToolRankItem {
  tool_name: string
  count: number
  success_rate: number
  trend: 'up' | 'down' | 'stable'
}

export interface McpRankItem {
  mcp_server: string
  count: number
  success_rate: number
}

export interface ToolsResponse {
  tools: ToolRankItem[]
  mcpServers: McpRankItem[]
  topToolSeries: { tool_name: string; series: TimePoint[] }[]
}

export interface HeatmapCell {
  day: number  // 0=Sun, 6=Sat
  hour: number // 0-23
  count: number
}

export interface HeatmapResponse {
  cells: HeatmapCell[]
  maxCount: number
}

export interface SatisfactionResponse {
  trend: { date: string; score: number }[]
  signals: { name: string; count: number }[]
  avgScore: number | null
}

export interface SessionArc {
  intent: string
  outcome: string
  count: number
}

export interface SessionListItem {
  session_id: string
  started_at: number
  prompt_count: number
  dominant_intent: string | null
  outcome: string | null
  satisfaction_score: number | null
}

export interface SessionsResponse {
  arcs: SessionArc[]
  recent: SessionListItem[]
}

export interface CompareItem {
  name: string
  total: number
  series: TimePoint[]
}

export interface CompareResponse {
  items: CompareItem[]
}

// ── Subject / Explore types ──

export interface SubjectExploreResponse {
  query: string
  totalSessions: number
  series: { date: string; count: number; normalized: number }[]
  relatedSubjects: { subject: string; count: number }[]
  sessions: SubjectSessionItem[]
}

export interface SubjectSessionItem {
  session_id: string
  started_at: number
  subject: string
  prompt_count: number
  dominant_intent: string | null
  outcome: string | null
}

export interface SubjectAutocompleteItem {
  subject: string
  count: number
}

export interface SubjectTrendingItem {
  subject: string
  count: number
  growth: number | null
}
