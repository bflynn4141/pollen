import { queryCommandRanking } from '@/lib/queries'
import type { Period } from '@/lib/types'
import DashboardShell from '@/components/DashboardShell'
import TabPageLayout from '@/components/TabPageLayout'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function CommandsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const items = await queryCommandRanking(period)

  return (
    <DashboardShell>
      <TabPageLayout
        items={items}
        period={period}
        config={{
          statCards: {
            totalLabel: 'Total Commands',
            uniqueLabel: 'Unique Categories',
            uniqueSubtitle: 'Command categories',
            topLabel: 'Top Command',
          },
          volumeTitle: 'Command Volume',
          trendingTitle: 'Trending Commands',
          barColor: 'var(--color-bar-commands)',
          labelWidth: 140,
        }}
      />
    </DashboardShell>
  )
}
