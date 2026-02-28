import { queryToolRanking, queryMcpRanking, queryTopToolSeries, queryHeatmap } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import TrendLine from '@/components/trends/TrendLine'
import BarRanking from '@/components/trends/BarRanking'
import HeatMap from '@/components/trends/HeatMap'
import { CHART_SERIES_COLORS } from '@/lib/colors'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function ToolsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period

  const [tools, mcpServers, topToolSeries, heatmap] = await Promise.all([
    queryToolRanking(period),
    queryMcpRanking(period),
    queryTopToolSeries(period),
    queryHeatmap(),
  ])

  const trendBadge = (t: 'up' | 'down' | 'stable') =>
    t === 'up' ? '↑' : t === 'down' ? '↓' : ''

  return (
    <div className="space-y-10">
      {/* Tool ranking */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Tool ranking</h2>
        {tools.length > 0 ? (
          <BarRanking
            data={tools.slice(0, 15).map(t => ({
              name: t.tool_name,
              value: t.count,
              badge: trendBadge(t.trend),
            }))}
            showBadge
            color="#C8B6FF"
          />
        ) : (
          <EmptyState />
        )}
      </section>

      {/* Top tools over time */}
      {topToolSeries.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Top 5 tools over time</h2>
          <TrendLine
            series={topToolSeries.map((t, i) => ({
              name: t.tool_name,
              data: t.series,
              color: CHART_SERIES_COLORS[i],
            }))}
            height={300}
          />
        </section>
      )}

      {/* MCP server ranking */}
      {mcpServers.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-200">MCP server ranking</h2>
          <BarRanking
            data={mcpServers.map(s => ({
              name: s.mcp_server,
              value: s.count,
            }))}
            color="#A8D8EA"
          />
        </section>
      )}

      {/* Activity heatmap */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Activity heatmap</h2>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <HeatMap cells={heatmap.cells} maxCount={heatmap.maxCount} />
        </div>
      </section>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-xl border border-white/10 bg-white/5">
      <p className="text-gray-500">No tool data for this period.</p>
    </div>
  )
}
