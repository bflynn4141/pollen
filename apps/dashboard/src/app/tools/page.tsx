import { queryToolRanking } from '@/lib/queries'
import type { Period } from '@/lib/types'
import DashboardShell from '@/components/DashboardShell'
import TabPageLayout from '@/components/TabPageLayout'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function ToolsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period
  const items = await queryToolRanking(period)

  return (
    <DashboardShell>
      <TabPageLayout
        items={items}
        period={period}
        config={{
          statCards: {
            totalLabel: 'Total Tool Calls',
            uniqueLabel: 'Unique Tools',
            uniqueSubtitle: 'Distinct tool names',
            topLabel: 'Top Tool',
          },
          volumeTitle: 'Tool Call Volume',
          trendingTitle: 'Trending Tools',
          barColor: 'var(--color-bar-tools)',
          labelWidth: 180,
        }}
      />
    </DashboardShell>
  )
}
