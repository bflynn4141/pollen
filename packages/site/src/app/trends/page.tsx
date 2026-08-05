import { parsePeriod } from '@/lib/parse-period'
import {
  queryOverview,
  querySessionArcs,
  querySatisfactionTrend,
  queryMcpSatisfactionDelta,
  queryPermissionModeDistribution,
  querySubagentTrend,
  queryHeatmap,
  queryModelUsage,
  querySessionDepthDistribution,
  queryReadWriteRatio,
} from '@/lib/queries'
import {
  latestWeek,
  readMcpCoUsage,
  readMcpGrowth,
  readMcpRanking,
  readToolSeries,
  readTrendingTools,
} from '@pollen/data'

import TrendCard from '@/components/trends/TrendCard'
import SectionHeader from '@/components/trends/SectionHeader'
import NivoBarRanking from '@/components/trends/NivoBarRanking'
import NivoTrendLine from '@/components/trends/NivoTrendLine'
import NivoDonut from '@/components/trends/NivoDonut'
import NivoHeatmap from '@/components/trends/NivoHeatmap'
import NivoSankey from '@/components/trends/NivoSankey'
import NivoDeltaBar from '@/components/trends/NivoDeltaBar'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function TrendsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = parsePeriod(params.period ?? null)

  // Entity-naming panels (tools, MCP servers) read the k-anonymized rollup
  // layer: latest published week vs the one before (weekly cadence, so the
  // period selector doesn't apply to them). Fixed-vocabulary aggregates
  // (models, permission modes, outcomes, heatmap...) stay on raw queries.
  // .catch(() => []) so the dashboard degrades (sections hide) instead of
  // 500ing when the rollup table is empty or not yet migrated.
  const week = await latestWeek().catch(() => null)

  const [
    overview,
    arcs,
    satisfaction,
    trendingTools,
    toolSeries,
    mcpRanking,
    coUsage,
    mcpSatisfactionDelta,
    mcpGrowthRollup,
    permissionModes,
    subagentTrend,
    heatmap,
    modelUsage,
    sessionDepth,
    readWrite,
  ] = await Promise.all([
    queryOverview(period),
    querySessionArcs(period),
    querySatisfactionTrend(period),
    week ? readTrendingTools(week).catch(() => []) : Promise.resolve([]),
    readToolSeries().catch(() => []),
    week ? readMcpRanking(week).catch(() => []) : Promise.resolve([]),
    week ? readMcpCoUsage(week).catch(() => []) : Promise.resolve([]),
    queryMcpSatisfactionDelta(period),
    week ? readMcpGrowth(week).catch(() => []) : Promise.resolve([]),
    queryPermissionModeDistribution(period),
    querySubagentTrend(period),
    queryHeatmap(),
    queryModelUsage(period),
    querySessionDepthDistribution(period),
    queryReadWriteRatio(period),
  ])

  // Adapt rollup readers to the shapes the existing components expect
  // (success_rate in cells is a 0–1 float; components want 0–100).
  const toolRanking = trendingTools.map(t => ({
    tool_name: t.tool,
    count: t.calls,
    success_rate: t.successPct,
    trend: t.trend,
  }))
  const topToolSeries = toolSeries.map(s => ({
    tool_name: s.tool,
    series: s.series.map(p => ({ date: p.date, count: p.calls })),
  }))
  const mcpAdoption = mcpRanking.map(s => ({
    server: s.server,
    session_count: s.sessions,
  }))
  const mcpCoUsage = coUsage.map(c => ({
    server_a: c.serverA,
    server_b: c.serverB,
    co_count: c.sessions,
  }))
  const mcpGrowth = mcpGrowthRollup.map(g => ({
    server: g.server,
    current_count: g.currentCalls,
    previous_count: g.previousCalls,
    growth_pct: g.growthPct,
  }))

  // ── Top-5 slicing (server-side) ──
  const mcpAdoptionTop5 = mcpAdoption.slice(0, 5)
  const toolRankingTop5 = toolRanking.slice(0, 5)
  const modelUsageTop5 = modelUsage.slice(0, 5)
  const mcpGrowthTop5 = mcpGrowth.slice(0, 5)

  // Co-usage: filter to only top-5 servers
  const coUsageServers = new Set(mcpAdoptionTop5.map(m => m.server))
  const mcpCoUsageFiltered = mcpCoUsage.filter(
    c => coUsageServers.has(c.server_a) && coUsageServers.has(c.server_b)
  )

  // ── Data transforms for Nivo ──

  // Bar ranking data: { id, value }
  const mcpAdoptionBars = mcpAdoptionTop5.map(m => ({
    id: m.server, value: m.session_count,
  }))
  const toolBars = toolRankingTop5.map(t => ({
    id: t.tool_name, value: t.count,
    badge: t.trend === 'up' ? '\u2191' : t.trend === 'down' ? '\u2193' : undefined,
  }))
  const modelBars = modelUsageTop5.map(m => ({
    id: m.model, value: m.count,
    badge: m.trend === 'up' ? '\u2191' : m.trend === 'down' ? '\u2193' : undefined,
  }))

  // MCP growth: diverging bars (growth %)
  const mcpGrowthBars = mcpGrowthTop5.map(g => ({
    id: g.server, value: g.growth_pct ?? 0,
  }))

  // Satisfaction delta: 2-bar comparison
  const satisfactionDeltaBars = mcpSatisfactionDelta.map(d => ({
    id: d.group_name === 'mcp' ? 'With MCP' : 'Without MCP',
    value: d.avg_satisfaction,
    sessions: d.session_count,
  }))

  // Co-usage heatmap: [{id: row, data: [{x: col, y: count}]}]
  const coUsageServersArr = [...coUsageServers]
  const coUsageHeatmapData = coUsageServersArr.map(row => ({
    id: row,
    data: coUsageServersArr.map(col => {
      if (row === col) return { x: col, y: null }
      const pair = mcpCoUsageFiltered.find(
        c => (c.server_a === row && c.server_b === col) || (c.server_a === col && c.server_b === row)
      )
      return { x: col, y: pair?.co_count ?? 0 }
    }),
  }))

  // Line series: { id, data: [{x, y}] }
  const toolLineSeries = topToolSeries.map(t => ({
    id: t.tool_name,
    data: t.series.map(p => ({ x: p.date, y: p.count })),
  }))

  const satisfactionLineSeries = [{
    id: 'Satisfaction',
    data: satisfaction.trend.map(t => ({ x: t.date, y: t.score })),
    color: '#6D5A82',
  }]

  const subagentLineSeries = [{
    id: 'Adoption %',
    data: subagentTrend.map(t => ({ x: t.date, y: t.adoption_pct })),
    color: '#4B8054',
  }]

  // Donut data: { id, label, value }
  const permissionDonutData = permissionModes.map(m => ({
    id: m.permission_mode, label: m.permission_mode, value: m.session_count,
  }))
  const sessionDepthDonutData = sessionDepth.map(b => ({
    id: b.bucket, label: b.label, value: b.count,
  }))

  // Sankey: nodes + links with prefixed IDs to avoid collision
  const intentNodes = [...new Set(arcs.map(a => a.intent))].map(i => ({ id: `intent:${i}` }))
  const outcomeNodes = [...new Set(arcs.map(a => a.outcome))].map(o => ({ id: `outcome:${o}` }))
  const sankeyData = {
    nodes: [...intentNodes, ...outcomeNodes],
    links: arcs.map(a => ({
      source: `intent:${a.intent}`,
      target: `outcome:${a.outcome}`,
      value: a.count,
    })),
  }

  // Activity heatmap: day × hour grid
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const activityHeatmapData = dayLabels.map((day, dayIdx) => ({
    id: day,
    data: Array.from({ length: 24 }, (_, hour) => {
      const cell = heatmap.cells.find(c => c.day === dayIdx && c.hour === hour)
      return { x: `${hour}:00`, y: cell?.count ?? 0 }
    }),
  }))

  return (
    <div className="space-y-4">

      {/* ── Section 1: MCP Ecosystem (Hero) ── */}
      <SectionHeader
        id="mcp"
        title="MCP Ecosystem"
        subtitle="Model Context Protocol server adoption, growth, and impact"
        badge={mcpAdoption.length > 0 ? `${mcpAdoption.length} servers tracked` : undefined}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {mcpAdoptionBars.length > 0 && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              Top 5 Server Adoption
            </h3>
            <NivoBarRanking data={mcpAdoptionBars} color="#5F7D85" height={200} />
          </div>
        )}

        {satisfactionDeltaBars.length > 0 && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              MCP Impact on Satisfaction
            </h3>
            <NivoDeltaBar data={satisfactionDeltaBars} height={200} />
          </div>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {coUsageHeatmapData.length > 0 && mcpCoUsageFiltered.length > 0 && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              Server Co-Usage Matrix
            </h3>
            <p className="mb-4 text-xs" style={{ color: 'var(--t-text-dim)' }}>
              How often two MCP servers appear in the same session
            </p>
            <NivoHeatmap data={coUsageHeatmapData} height={240} />
          </div>
        )}

        {mcpGrowthBars.length > 0 && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              Server Growth Rate
            </h3>
            <p className="mb-4 text-xs" style={{ color: 'var(--t-text-dim)' }}>
              Period-over-period change in session count
            </p>
            <NivoBarRanking data={mcpGrowthBars} color="#4B8054" height={200} />
          </div>
        )}
      </div>


      {/* ── Section 2: Overview ── */}
      <SectionHeader
        id="overview"
        title="Overview"
        subtitle="High-level snapshot of Claude Code usage"
        badge={`${overview.totalSessions.toLocaleString()} sessions`}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <TrendCard
          label="Prompts"
          value={overview.totalPrompts.toLocaleString()}
          sparkline={overview.sparkline}
          color="#C66A3B"
        />
        <TrendCard
          label="Sessions"
          value={overview.totalSessions.toLocaleString()}
          color="#5F7D85"
        />
        <TrendCard
          label="Tool Events"
          value={overview.totalToolEvents.toLocaleString()}
          color="#4B8054"
        />
        <TrendCard
          label="Avg Satisfaction"
          value={overview.avgSatisfaction != null ? `${overview.avgSatisfaction}%` : '\u2014'}
          color="#6D5A82"
        />
      </div>

      {sessionDepthDonutData.length > 0 && (
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
            Session Depth
          </h3>
          <p className="mb-4 text-xs" style={{ color: 'var(--t-text-dim)' }}>
            Distribution of prompts per session
          </p>
          <NivoDonut data={sessionDepthDonutData} height={280} />
        </div>
      )}


      {/* ── Section 3: Tool Ecosystem ── */}
      <SectionHeader
        id="tools"
        title="Tool Ecosystem"
        subtitle="Which tools developers reach for and how often"
        badge={toolRanking.length > 0 ? `${toolRanking.length} tools` : undefined}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {toolBars.length > 0 && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              Top 5 Tools
            </h3>
            <NivoBarRanking data={toolBars} showBadge color="#C66A3B" height={200} />
          </div>
        )}

        {toolLineSeries.length > 0 && toolLineSeries.some(s => s.data.length > 1) && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              Top Tools Over Time
            </h3>
            <NivoTrendLine series={toolLineSeries} height={200} />
          </div>
        )}
      </div>

      {readWrite.ratio !== null && (
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
          <div className="flex items-baseline gap-6">
            <div>
              <p className="text-sm" style={{ color: 'var(--t-text-muted)' }}>Read/Write Ratio</p>
              <p className="text-3xl font-bold" style={{ color: 'var(--t-text)' }}>{readWrite.ratio}:1</p>
            </div>
            <div className="flex gap-6 text-sm" style={{ color: 'var(--t-text-dim)' }}>
              <span>{readWrite.reads.toLocaleString()} reads</span>
              <span>{readWrite.edits.toLocaleString()} edits</span>
            </div>
          </div>
        </div>
      )}


      {/* ── Section 4: Session Flow ── */}
      <SectionHeader
        id="sessions"
        title="Session Flow"
        subtitle="How developer sessions start, evolve, and end"
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {sankeyData.nodes.length > 0 && sankeyData.links.length > 0 && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              Intent → Outcome
            </h3>
            <NivoSankey data={sankeyData} height={320} />
          </div>
        )}

        {satisfaction.trend.length > 1 && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              Satisfaction Trend
              {satisfaction.avgScore != null && (
                <span className="ml-2 normal-case tracking-normal" style={{ color: 'var(--t-text-dim)' }}>
                  avg: {satisfaction.avgScore}%
                </span>
              )}
            </h3>
            <NivoTrendLine series={satisfactionLineSeries} height={280} yLabel="Score" />
          </div>
        )}
      </div>


      {/* ── Section 5: Developer Behavior + Activity ── */}
      <SectionHeader
        id="behavior"
        title="Developer Behavior"
        subtitle="Permission modes, subagent usage, and activity patterns"
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {permissionDonutData.length > 0 && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              Permission Mode Distribution
            </h3>
            <NivoDonut data={permissionDonutData} height={280} />
          </div>
        )}

        {subagentLineSeries[0].data.length > 1 && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              Subagent Adoption
            </h3>
            <NivoTrendLine series={subagentLineSeries} height={280} yLabel="%" />
          </div>
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
          <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
            Activity Heatmap (Day × Hour)
          </h3>
          <NivoHeatmap data={activityHeatmapData} height={260} />
        </div>

        {modelBars.length > 0 && (
          <div className="rounded-xl border p-5" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
              Model Usage (Top 5)
            </h3>
            <NivoBarRanking data={modelBars} showBadge color="#6D5A82" height={200} />
          </div>
        )}
      </div>


      {/* ── Footer CTA ── */}
      <div
        className="mt-20 rounded-2xl border p-8 text-center sm:p-12"
        style={{ borderColor: '#E0DBD5', background: '#FFFFFF' }}
      >
        <h2
          className="font-[family-name:var(--font-grotesk)] text-3xl font-bold sm:text-4xl"
          style={{ color: 'var(--t-text)' }}
        >
          Get this data as an API
        </h2>
        <p className="mx-auto mt-4 max-w-xl" style={{ color: 'var(--t-text-muted)' }}>
          Weekly trending tools and MCP servers, free. Full history via x402 micropayments —
          USDC on Base, no API keys, no accounts. Every cell aggregates at least 5 contributors.
        </p>

        <div
          className="mx-auto mt-8 max-w-2xl rounded-xl border p-5 text-left"
          style={{ borderColor: 'var(--t-border)', background: '#FAFAF8' }}
        >
          <pre className="overflow-x-auto text-sm leading-relaxed font-[family-name:var(--font-mono)]" style={{ color: '#C45D3E' }}>
            <code>{`# Free: latest two weeks of trending tools
curl https://api.pollen.id/trending/tools

# Paid ($0.01 via x402): full weekly history for one tool
curl "https://api.pollen.id/tools/history?tool=Bash"
# → 402 Payment Required + payment requirements; retry with
#   an x402 client (x402-fetch) to pay in USDC on Base`}</code>
          </pre>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="/docs/api"
            className="rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors"
            style={{ background: 'var(--t-accent)' }}
          >
            Read the docs →
          </a>
          <a
            href="/trending"
            className="rounded-lg border px-6 py-3 text-sm font-medium transition-colors"
            style={{ borderColor: 'var(--t-border)', color: 'var(--t-text-muted)' }}
          >
            Weekly trending page
          </a>
        </div>
      </div>
    </div>
  )
}
