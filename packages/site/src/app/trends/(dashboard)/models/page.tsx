import { queryModelUsage } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import VolumeChart from '@/components/dashboard/VolumeChart'
import TrendingList from '@/components/dashboard/TrendingList'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function ModelsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const items = await queryModelUsage(period)

  return (
    <div className="grid grid-cols-[1fr_380px] gap-5">
      <div
        className="rounded-xl p-6"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <VolumeChart
          title="Model Usage"
          items={items.map(i => ({ name: i.model, count: i.count }))}
          color="var(--bar-models)"
          labelWidth={180}
        />
      </div>
      <div
        className="rounded-xl p-6"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <TrendingList
          title="Trending Models"
          items={items.map(i => ({
            name: i.model,
            changePercent: i.changePercent,
            count: i.count,
            trend: i.trend,
          }))}
        />
      </div>
    </div>
  )
}
