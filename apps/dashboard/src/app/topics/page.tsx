import { queryIntentRanking } from '@/lib/queries'
import type { Period } from '@/lib/types'
import DashboardShell from '@/components/DashboardShell'
import TabPageLayout from '@/components/TabPageLayout'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function TopicsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const items = await queryIntentRanking(period)

  return (
    <DashboardShell>
      <TabPageLayout
        items={items}
        period={period}
        config={{
          statCards: {
            totalLabel: 'Total Sessions',
            uniqueLabel: 'Unique Topics',
            uniqueSubtitle: 'Classified categories',
            topLabel: 'Top Topic',
          },
          volumeTitle: 'Topic Volume',
          trendingTitle: 'Trending Topics',
          barColor: 'var(--color-bar-topics)',
          labelWidth: 120,
        }}
      />
    </DashboardShell>
  )
}
