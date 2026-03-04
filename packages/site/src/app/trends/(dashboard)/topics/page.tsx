import { queryTopicDashboard } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import VolumeChart from '@/components/dashboard/VolumeChart'
import TrendingList from '@/components/dashboard/TrendingList'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function TopicsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const items = await queryTopicDashboard(period)

  return (
    <div className="grid grid-cols-[1fr_380px] gap-5">
      <div
        className="rounded-xl p-6"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <VolumeChart
          title="Topic Volume"
          items={items.map(i => ({ name: i.name, count: i.count }))}
          color="var(--bar-topics)"
          labelWidth={130}
        />
      </div>
      <div
        className="rounded-xl p-6"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <TrendingList
          title="Trending Topics"
          items={items.map(i => ({
            name: i.name,
            changePercent: i.changePercent,
            count: i.count,
            trend: i.trend,
          }))}
        />
      </div>
    </div>
  )
}
