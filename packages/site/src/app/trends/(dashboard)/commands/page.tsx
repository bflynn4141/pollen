import { queryCommandRanking } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import VolumeChart from '@/components/dashboard/VolumeChart'
import TrendingList from '@/components/dashboard/TrendingList'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function CommandsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const items = await queryCommandRanking(period)

  return (
    <div className="grid grid-cols-[1fr_380px] gap-5">
      <div
        className="rounded-xl p-6"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <VolumeChart
          title="Command Volume"
          items={items.map(i => ({ name: i.command_category, count: i.count }))}
          color="var(--bar-commands)"
          labelWidth={140}
        />
      </div>
      <div
        className="rounded-xl p-6"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
      >
        <TrendingList
          title="Trending Commands"
          items={items.map(i => ({
            name: i.command_category,
            changePercent: i.changePercent,
            count: i.count,
            trend: i.trend,
          }))}
        />
      </div>
    </div>
  )
}
