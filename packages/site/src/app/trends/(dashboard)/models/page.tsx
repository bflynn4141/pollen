import { queryModelUsage } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import StatCards from '@/components/dashboard/StatCards'
import VolumeChart from '@/components/dashboard/VolumeChart'
import TrendingList from '@/components/dashboard/TrendingList'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function ModelsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const items = await queryModelUsage(period)

  const total = items.reduce((sum, i) => sum + i.count, 0)
  const unique = items.length
  const top = items[0]

  return (
    <div className="space-y-8">
      <StatCards
        cards={[
          {
            label: 'Total Sessions',
            value: total.toLocaleString(),
            subtitle: '+22.7% from last period',
          },
          {
            label: 'Models Tracked',
            value: unique.toLocaleString(),
            subtitle: `across ${unique} model families`,
          },
          {
            label: 'Top Model',
            value: top?.model ?? '—',
            subtitle: top ? `${top.count.toLocaleString()} sessions this period` : 'No data',
            variant: 'featured',
          },
        ]}
      />

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
    </div>
  )
}
