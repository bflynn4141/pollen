import { queryModelUsage } from '@/lib/queries'
import type { Period } from '@/lib/types'
import DashboardShell from '@/components/DashboardShell'
import TabPageLayout from '@/components/TabPageLayout'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function ModelsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const items = await queryModelUsage(period)

  return (
    <DashboardShell>
      <TabPageLayout
        items={items}
        period={period}
        config={{
          statCards: {
            totalLabel: 'Total Sessions',
            uniqueLabel: 'Models Tracked',
            uniqueSubtitle: 'Distinct model IDs',
            topLabel: 'Top Model',
          },
          volumeTitle: 'Model Usage',
          trendingTitle: 'Trending Models',
          barColor: 'var(--color-bar-models)',
          labelWidth: 180,
        }}
      />
    </DashboardShell>
  )
}
