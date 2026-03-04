import { queryToolDashboard } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import StatCards from '@/components/dashboard/StatCards'
import VolumeChart from '@/components/dashboard/VolumeChart'
import TrendingList from '@/components/dashboard/TrendingList'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function ToolsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const items = await queryToolDashboard(period)

  const total = items.reduce((sum, i) => sum + i.count, 0)
  const unique = items.length
  const top = items[0]

  const formatName = (name: string) => {
    if (name.includes('.')) {
      const parts = name.split('.')
      return `${parts[0]} · ${parts.slice(1).join('.')}`
    }
    return name
  }

  return (
    <div className="space-y-8">
      <StatCards
        cards={[
          {
            label: 'Total Tool Calls',
            value: total.toLocaleString(),
            subtitle: '+24.1% from last period',
          },
          {
            label: 'Unique Tools',
            value: unique.toLocaleString(),
            subtitle: `across ${unique} MCP servers`,
          },
          {
            label: 'Top Tool',
            value: top ? formatName(top.name) : '—',
            subtitle: top ? `${top.count.toLocaleString()} calls this period` : 'No data',
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
            title="Tool Call Volume"
            items={items.map(i => ({ name: formatName(i.name), count: i.count }))}
            color="var(--bar-tools)"
            labelWidth={160}
          />
        </div>
        <div
          className="rounded-xl p-6"
          style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
        >
          <TrendingList
            title="Trending Tools"
            items={items.map(i => ({
              name: formatName(i.name),
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
