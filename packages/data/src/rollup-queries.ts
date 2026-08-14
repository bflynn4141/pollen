import { getDb } from './neon'
import type { ReceiptRankingWindow } from './receipt-windows'
import { prevWeek } from './week'

/**
 * Read layer over rollup_cells — the ONLY data access allowed from public
 * surfaces: the site's /app/trending/** and /app/api/v1/** and the pollen-api
 * worker. Never import the site's raw-table queries (@/lib/queries) from
 * those surfaces: rollup_cells is written exclusively by computeRollups(),
 * which suppresses every cell with fewer than K=5 distinct contributors, so
 * anything readable here is k-anonymous by construction.
 *
 * success_rate is stored as a 0–1 float in cells; readers that feed legacy
 * components expose successPct (0–100) alongside it.
 */

export const K_ANONYMITY = 5

interface CellRow {
  period: string
  dims: Record<string, string>
  value: Record<string, number>
  contributors: number
}

export interface TrendingTool {
  tool: string
  kind: 'builtin' | 'mcp'
  server: string | null
  calls: number
  sessions: number
  successRate: number   // 0–1
  successPct: number    // 0–100, rounded
  contributors: number
  prevCalls: number | null
  changePct: number | null
  trend: 'up' | 'down' | 'stable'
  isNew: boolean
}

export interface McpServerRank {
  server: string
  calls: number
  sessions: number
  successRate: number
  successPct: number
  contributors: number
}

export interface McpGrowth {
  server: string
  currentCalls: number
  previousCalls: number
  growthPct: number | null
  contributors: number
}

export interface McpCoUsagePair {
  serverA: string
  serverB: string
  sessions: number
  contributors: number
}

export interface NetworkOverview {
  week: string
  toolCalls: number
  sessions: number
  tools: number
  mcpServers: number
  contributors: number
}

export interface ReceiptOverview {
  period: string
  sessions: number
  categoryEvents: number
  completionRate: number
  checkPassRate: number
  contributors: number
}

export interface ReceiptModelRank {
  agent: string
  model: string
  sessions: number
  completionRate: number
  checkPassRate: number
  contributors: number
}

export interface ReceiptCategoryRank {
  category: string
  events: number
  sessions: number
  completionRate: number
  checkPassRate: number
  contributors: number
}

export interface ReceiptIntentRank {
  intent: string
  sessions: number
  completionRate: number
  checkPassRate: number
  contributors: number
}

export interface ReceiptWorkflowRank {
  sequence: string[]
  sessions: number
  completionRate: number
  checkPassRate: number
  contributors: number
}

export interface ReceiptNetworkSnapshot {
  period: string
  overview: ReceiptOverview
  models: ReceiptModelRank[]
  toolCategories: ReceiptCategoryRank[]
  intents: ReceiptIntentRank[]
  workflows: ReceiptWorkflowRank[]
}

export interface ToolSeries {
  tool: string
  series: { date: string; calls: number }[]
}

async function readCells(rollup: string, period: string): Promise<CellRow[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT period, dims, value, contributors
    FROM rollup_cells
    WHERE rollup = ${rollup} AND period = ${period}`
  return rows as unknown as CellRow[]
}

/** Weeks with published tool_calls cells, newest first. */
export async function listWeeks(): Promise<string[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT DISTINCT period FROM rollup_cells
    WHERE rollup = 'tool_calls'
    ORDER BY period DESC`
  return rows.map(r => String(r.period))
}

export async function latestWeek(): Promise<string | null> {
  const weeks = await listWeeks()
  return weeks[0] ?? null
}

/** Weeks with a publishable receipt overview, newest first. */
export async function listReceiptWeeks(): Promise<string[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT DISTINCT period FROM rollup_cells
    WHERE rollup = 'receipt_overview' AND period ~ '^\\d{4}-W\\d{2}$'
    ORDER BY period DESC`
  return rows.map(r => String(r.period))
}

/**
 * Trending tools for a week: joins the week against the previous week in JS
 * and applies the same ±10% up/down/stable badge thresholds the /trends
 * ranking has always used. Tools absent last week are flagged `isNew`.
 */
export async function readTrendingTools(week: string): Promise<TrendingTool[]> {
  const [cur, prev] = await Promise.all([
    readCells('tool_calls', week),
    readCells('tool_calls', prevWeek(week)),
  ])

  const prevCallsByTool = new Map<string, number>()
  for (const cell of prev) {
    prevCallsByTool.set(cell.dims.tool, Number(cell.value.calls))
  }

  return cur
    .map(cell => {
      const calls = Number(cell.value.calls)
      const prevCalls = prevCallsByTool.get(cell.dims.tool) ?? null
      let trend: 'up' | 'down' | 'stable' = 'stable'
      let changePct: number | null = null
      if (prevCalls != null && prevCalls > 0) {
        const change = (calls - prevCalls) / prevCalls
        changePct = Math.round(change * 100)
        if (change > 0.1) trend = 'up'
        else if (change < -0.1) trend = 'down'
      } else if (calls > 0) {
        trend = 'up'
      }
      const successRate = Number(cell.value.success_rate)
      return {
        tool: cell.dims.tool,
        kind: (cell.dims.kind === 'mcp' ? 'mcp' : 'builtin') as 'builtin' | 'mcp',
        server: cell.dims.server ?? null,
        calls,
        sessions: Number(cell.value.sessions),
        successRate,
        successPct: Math.round(successRate * 100),
        contributors: cell.contributors,
        prevCalls,
        changePct,
        trend,
        isNew: prevCalls == null,
      }
    })
    .sort((a, b) => b.calls - a.calls)
}

export async function readMcpRanking(week: string): Promise<McpServerRank[]> {
  const cells = await readCells('mcp_server_calls', week)
  return cells
    .map(cell => {
      const successRate = Number(cell.value.success_rate)
      return {
        server: cell.dims.server,
        calls: Number(cell.value.calls),
        sessions: Number(cell.value.sessions),
        successRate,
        successPct: Math.round(successRate * 100),
        contributors: cell.contributors,
      }
    })
    .sort((a, b) => b.calls - a.calls)
}

/** Week-over-week MCP server growth, new servers first (growthPct null). */
export async function readMcpGrowth(week: string): Promise<McpGrowth[]> {
  const [cur, prev] = await Promise.all([
    readCells('mcp_server_calls', week),
    readCells('mcp_server_calls', prevWeek(week)),
  ])

  const prevByServer = new Map<string, number>()
  for (const cell of prev) prevByServer.set(cell.dims.server, Number(cell.value.calls))

  return cur
    .map(cell => {
      const currentCalls = Number(cell.value.calls)
      const previousCalls = prevByServer.get(cell.dims.server) ?? 0
      const growthPct = previousCalls > 0
        ? Math.round(((currentCalls - previousCalls) / previousCalls) * 100)
        : null
      return { server: cell.dims.server, currentCalls, previousCalls, growthPct, contributors: cell.contributors }
    })
    .sort((a, b) => {
      if (a.growthPct === null && b.growthPct === null) return b.currentCalls - a.currentCalls
      if (a.growthPct === null) return -1
      if (b.growthPct === null) return 1
      return b.growthPct - a.growthPct
    })
}

export async function readMcpCoUsage(week: string): Promise<McpCoUsagePair[]> {
  const cells = await readCells('mcp_co_usage', week)
  return cells
    .map(cell => ({
      serverA: cell.dims.server_a,
      serverB: cell.dims.server_b,
      sessions: Number(cell.value.sessions),
      contributors: cell.contributors,
    }))
    .sort((a, b) => b.sessions - a.sessions)
}

export async function readOverview(week: string): Promise<NetworkOverview | null> {
  const cells = await readCells('network_overview', week)
  const cell = cells[0]
  if (!cell) return null
  return {
    week,
    toolCalls: Number(cell.value.tool_calls),
    sessions: Number(cell.value.sessions),
    tools: Number(cell.value.tools),
    mcpServers: Number(cell.value.mcp_servers),
    contributors: cell.contributors,
  }
}

/**
 * Read the privacy-closed production network snapshot for one week. A missing
 * overview means fewer than K distinct contributors qualified, so callers
 * must render a warm-up state rather than inspect raw receipt counts.
 */
export async function readReceiptNetwork(period: string): Promise<ReceiptNetworkSnapshot | null> {
  const [overviewCells, modelCells, categoryCells, intentCells, workflowCells] = await Promise.all([
    readCells('receipt_overview', period),
    readCells('receipt_models', period),
    readCells('receipt_tool_categories', period),
    readCells('receipt_intents', period),
    readCells('receipt_workflows', period),
  ])
  const overview = overviewCells[0]
  if (!overview) return null

  const rate = (cell: CellRow, key: string) => Number(cell.value[key] ?? 0)
  return {
    period,
    overview: {
      period,
      sessions: Number(overview.value.sessions),
      categoryEvents: Number(overview.value.category_events),
      completionRate: rate(overview, 'completion_rate'),
      checkPassRate: rate(overview, 'check_pass_rate'),
      contributors: overview.contributors,
    },
    models: modelCells.map(cell => ({
      agent: cell.dims.agent,
      model: cell.dims.model,
      sessions: Number(cell.value.sessions),
      completionRate: rate(cell, 'completion_rate'),
      checkPassRate: rate(cell, 'check_pass_rate'),
      contributors: cell.contributors,
    })).sort((a, b) => b.sessions - a.sessions),
    toolCategories: categoryCells.map(cell => ({
      category: cell.dims.category,
      events: Number(cell.value.events),
      sessions: Number(cell.value.sessions),
      completionRate: rate(cell, 'completion_rate'),
      checkPassRate: rate(cell, 'check_pass_rate'),
      contributors: cell.contributors,
    })).sort((a, b) => b.events - a.events),
    intents: intentCells.map(cell => ({
      intent: cell.dims.intent,
      sessions: Number(cell.value.sessions),
      completionRate: rate(cell, 'completion_rate'),
      checkPassRate: rate(cell, 'check_pass_rate'),
      contributors: cell.contributors,
    })).sort((a, b) => b.sessions - a.sessions),
    workflows: workflowCells.map(cell => ({
      sequence: cell.dims.sequence.split('>').filter(Boolean),
      sessions: Number(cell.value.sessions),
      completionRate: rate(cell, 'completion_rate'),
      checkPassRate: rate(cell, 'check_pass_rate'),
      contributors: cell.contributors,
    })).sort((a, b) => b.sessions - a.sessions),
  }
}

export interface ReceiptNetworkWindow {
  current: ReceiptNetworkSnapshot | null
  previous: ReceiptNetworkSnapshot | null
}

/** Rolling dashboard windows; missing cells remain null when K is not met. */
export async function readReceiptNetworkWindows(): Promise<Record<ReceiptRankingWindow, ReceiptNetworkWindow>> {
  const windows: ReceiptRankingWindow[] = ['24h', '7d', '30d']
  const pairs = await Promise.all(windows.map(async window => ({
    window,
    current: await readReceiptNetwork(`rolling:${window}:current`),
    previous: await readReceiptNetwork(`rolling:${window}:previous`),
  })))
  return Object.fromEntries(pairs.map(({ window, current, previous }) => [window, { current, previous }])) as Record<ReceiptRankingWindow, ReceiptNetworkWindow>
}

/** Daily call series for the top `limit` tools over the last `days` days. */
export async function readToolSeries(days = 56, limit = 5): Promise<ToolSeries[]> {
  const sql = getDb()
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const rows = await sql`
    SELECT period, dims->>'tool' AS tool, (value->>'calls')::int AS calls
    FROM rollup_cells
    WHERE rollup = 'tool_daily_series' AND period >= ${since}
    ORDER BY period`

  const totals = new Map<string, number>()
  const series = new Map<string, { date: string; calls: number }[]>()
  for (const r of rows) {
    const tool = String(r.tool)
    const calls = Number(r.calls)
    totals.set(tool, (totals.get(tool) ?? 0) + calls)
    if (!series.has(tool)) series.set(tool, [])
    series.get(tool)!.push({ date: String(r.period), calls })
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tool]) => ({ tool, series: series.get(tool)! }))
}

// ── Paid-API readers (full frozen history) ──

export interface HistoryCell {
  week: string
  calls: number
  sessions: number
  successRate: number
  contributors: number
}

export async function readToolHistory(tool: string): Promise<HistoryCell[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT period, value, contributors FROM rollup_cells
    WHERE rollup = 'tool_calls' AND dims->>'tool' = ${tool}
    ORDER BY period`
  return rows.map(r => {
    const value = r.value as Record<string, number>
    return {
      week: String(r.period),
      calls: Number(value.calls),
      sessions: Number(value.sessions),
      successRate: Number(value.success_rate),
      contributors: Number(r.contributors),
    }
  })
}

export async function readMcpHistory(server: string): Promise<HistoryCell[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT period, value, contributors FROM rollup_cells
    WHERE rollup = 'mcp_server_calls' AND dims->>'server' = ${server}
    ORDER BY period`
  return rows.map(r => {
    const value = r.value as Record<string, number>
    return {
      week: String(r.period),
      calls: Number(value.calls),
      sessions: Number(value.sessions),
      successRate: Number(value.success_rate),
      contributors: Number(r.contributors),
    }
  })
}

/** Every tool × week and server × week cell, all history. */
export async function readGrid(): Promise<{ tools: CellRow[]; mcpServers: CellRow[] }> {
  const sql = getDb()
  const [tools, mcpServers] = await Promise.all([
    sql`SELECT period, dims, value, contributors FROM rollup_cells
        WHERE rollup = 'tool_calls' ORDER BY period, dims->>'tool'`,
    sql`SELECT period, dims, value, contributors FROM rollup_cells
        WHERE rollup = 'mcp_server_calls' ORDER BY period, dims->>'server'`,
  ])
  return { tools: tools as unknown as CellRow[], mcpServers: mcpServers as unknown as CellRow[] }
}

/** Full dump of every published rollup cell. */
export async function readExport(): Promise<(CellRow & { rollup: string; computed_at: string })[]> {
  const sql = getDb()
  const rows = await sql`
    SELECT rollup, period, dims, value, contributors, computed_at
    FROM rollup_cells
    ORDER BY rollup, period`
  return rows as unknown as (CellRow & { rollup: string; computed_at: string })[]
}
