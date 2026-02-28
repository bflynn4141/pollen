import { Suspense } from 'react'
import { queryOverview, querySubjectTrending } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import TrendCard from '@/components/trends/TrendCard'
import TrendLine from '@/components/trends/TrendLine'
import SearchHero from '@/components/trends/SearchHero'
import SubjectCard from '@/components/trends/SubjectCard'
import { getTopicColor } from '@/lib/colors'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function OverviewPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const [data, trending] = await Promise.all([
    queryOverview(period),
    querySubjectTrending(period),
  ])

  return (
    <div className="space-y-8">
      {/* Search hero */}
      <SearchHero />

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <TrendCard
          label="Prompts"
          value={data.totalPrompts.toLocaleString()}
          sparkline={data.sparkline}
          color="#C8B6FF"
        />
        <TrendCard
          label="Sessions"
          value={data.totalSessions.toLocaleString()}
          color="#F2B5D4"
        />
        <TrendCard
          label="Tool Events"
          value={data.totalToolEvents.toLocaleString()}
          color="#A8D8EA"
        />
        <TrendCard
          label="Avg Satisfaction"
          value={data.avgSatisfaction != null ? `${data.avgSatisfaction}%` : '—'}
          delta={data.topTopic?.name ?? undefined}
          color="#F5D89A"
        />
      </div>

      {/* Trending subjects */}
      {trending.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Trending subjects</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trending.slice(0, 9).map((item, i) => (
              <SubjectCard
                key={item.subject}
                subject={item.subject}
                count={item.count}
                growth={item.growth}
                rank={i + 1}
              />
            ))}
          </div>
        </section>
      )}

      {/* Prompts per day line chart */}
      {data.sparkline.length > 1 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Prompts per day</h2>
          <Suspense fallback={<ChartSkeleton />}>
            <TrendLine
              series={[{ name: 'Prompts', data: data.sparkline, color: '#C8B6FF' }]}
              height={280}
            />
          </Suspense>
        </section>
      )}

      {/* Top rankings side-by-side */}
      <div className="grid gap-8 md:grid-cols-2">
        {data.topTopic && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-gray-200">Top Topic</h2>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-2xl font-bold" style={{ color: getTopicColor(data.topTopic.name) }}>
                {data.topTopic.name}
              </p>
              <p className="text-sm text-gray-400">{data.topTopic.count} prompts</p>
            </div>
          </section>
        )}
        {data.topTool && (
          <section>
            <h2 className="mb-4 text-lg font-semibold text-gray-200">Top Tool</h2>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <p className="text-2xl font-bold text-[#A8D8EA]">{data.topTool.name}</p>
              <p className="text-sm text-gray-400">{data.topTool.count} uses</p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return <div className="h-[280px] animate-pulse rounded-xl bg-white/5" />
}
