import { queryCompare, queryTopicTrends, queryActionTrends, queryToolRanking } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import TrendLine from '@/components/trends/TrendLine'
import CompareSearch from '@/components/trends/CompareSearch'
import { getTopicColor, CHART_SERIES_COLORS } from '@/lib/colors'

interface Props {
  searchParams: Promise<{ period?: string; items?: string; type?: string }>
}

export default async function ComparePage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const type = (params.type ?? 'topics') as 'topics' | 'actions' | 'tools'
  const items = params.items?.split(',').filter(Boolean) ?? []

  // Fetch suggestions for autocomplete
  const [topicTrends, actionTrends, toolRanking] = await Promise.all([
    queryTopicTrends(period),
    queryActionTrends(period),
    queryToolRanking(period),
  ])

  const suggestions: Record<string, string[]> = {
    topics: topicTrends.map(t => t.topic),
    actions: actionTrends.map(a => a.action),
    tools: toolRanking.map(t => t.tool_name),
  }

  // Fetch comparison data
  const compareData = items.length > 0
    ? await queryCompare(items, type, period)
    : []

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Compare</h2>
        <CompareSearch suggestions={suggestions[type] ?? []} type={type} />
      </section>

      {/* Overlaid time series */}
      {compareData.length > 0 && (
        <section>
          <TrendLine
            series={compareData.map((item, i) => ({
              name: item.name,
              data: item.series,
              color: type === 'topics'
                ? getTopicColor(item.name)
                : CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length],
            }))}
            height={350}
          />
        </section>
      )}

      {/* Stats table */}
      {compareData.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium text-gray-400">Side-by-side stats</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-gray-400">
                  <th className="pb-2 pr-6">Name</th>
                  <th className="pb-2 pr-6">Total</th>
                  <th className="pb-2 pr-6">Data points</th>
                  <th className="pb-2">Peak</th>
                </tr>
              </thead>
              <tbody>
                {compareData.map((item, i) => {
                  const peak = item.series.reduce((max, pt) => pt.count > max.count ? pt : max, { date: '', count: 0 })
                  return (
                    <tr key={item.name} className="border-b border-white/5 text-gray-300">
                      <td className="py-2 pr-6 font-medium" style={{
                        color: type === 'topics'
                          ? getTopicColor(item.name)
                          : CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]
                      }}>
                        {item.name}
                      </td>
                      <td className="py-2 pr-6">{item.total.toLocaleString()}</td>
                      <td className="py-2 pr-6">{item.series.length}</td>
                      <td className="py-2">{peak.count} ({peak.date.slice(5)})</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {items.length === 0 && (
        <div className="flex h-[300px] items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <p className="text-gray-500">Select items above to compare their trends</p>
        </div>
      )}
    </div>
  )
}
