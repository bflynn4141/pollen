import { queryTopicTrends, queryActionTrends } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import TrendLine from '@/components/trends/TrendLine'
import StackedArea from '@/components/trends/StackedArea'
import BarRanking from '@/components/trends/BarRanking'
import { getTopicColor } from '@/lib/colors'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function TopicsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const [topicData, actionData] = await Promise.all([
    queryTopicTrends(period),
    queryActionTrends(period),
  ])

  const topTopics = topicData.slice(0, 10)
  const topActions = actionData.slice(0, 8)

  return (
    <div className="space-y-10">
      {/* Topic trend lines */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Topic trends</h2>
        {topTopics.length > 0 ? (
          <TrendLine
            series={topTopics.map(t => ({
              name: t.topic,
              data: t.series,
              color: getTopicColor(t.topic),
            }))}
            height={350}
          />
        ) : (
          <EmptyState />
        )}
      </section>

      {/* Topic ranking bars */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Topic ranking</h2>
        {topTopics.length > 0 ? (
          <BarRanking
            data={topTopics.map(t => ({
              name: t.topic,
              value: t.total,
              color: getTopicColor(t.topic),
            }))}
          />
        ) : (
          <EmptyState />
        )}
      </section>

      {/* Stacked actions area */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Actions over time</h2>
        {topActions.length > 0 ? (
          <StackedArea
            series={topActions.map(a => ({
              name: a.action,
              data: a.series,
            }))}
            height={300}
          />
        ) : (
          <EmptyState />
        )}
      </section>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-xl border border-white/10 bg-white/5">
      <p className="text-gray-500">No data for this period. Try syncing or expanding the time range.</p>
    </div>
  )
}
