import type { RankItem } from '@/lib/types'
import StatCards from './StatCards'
import VolumeChart from './VolumeChart'
import TrendingList from './TrendingList'

interface TabConfig {
  statCards: {
    totalLabel: string
    uniqueLabel: string
    uniqueSubtitle: string
    topLabel: string
  }
  volumeTitle: string
  trendingTitle: string
  barColor: string
  labelWidth?: number
}

interface Props {
  items: RankItem[]
  period: string
  config: TabConfig
}

export default function TabPageLayout({ items, period, config }: Props) {
  const total = items.reduce((sum, i) => sum + i.count, 0)
  const unique = items.length
  const top = items[0]

  return (
    <div className="space-y-8">
      <StatCards
        cards={[
          {
            label: config.statCards.totalLabel,
            value: total.toLocaleString(),
            subtitle: `${period} window`,
          },
          {
            label: config.statCards.uniqueLabel,
            value: unique.toLocaleString(),
            subtitle: config.statCards.uniqueSubtitle,
          },
          {
            label: config.statCards.topLabel,
            value: top?.name ?? '—',
            subtitle: top ? `${top.count.toLocaleString()} total` : 'No data',
            variant: 'featured',
          },
        ]}
      />

      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 380px' }}>
        <VolumeChart
          title={config.volumeTitle}
          items={items}
          color={config.barColor}
          labelWidth={config.labelWidth}
        />
        <TrendingList
          title={config.trendingTitle}
          items={items}
        />
      </div>
    </div>
  )
}
