import {
  latestWeek,
  listWeeks,
  readMcpRanking,
  readOverview,
  readTrendingTools,
} from '@pollen/data'
import TrendingWeekView from './TrendingWeekView'

// /trending always shows the most recent published week. Permalinks live at
// /trending/<week>. Reads ONLY the k-anonymized rollup layer.
export const revalidate = 3600

export default async function TrendingPage() {
  // Degrade to the empty state if the rollup table doesn't exist yet
  // (pre-migration deploys / builds against a fresh branch).
  const week = await latestWeek().catch(() => null)

  if (!week) {
    return (
      <div className="rounded-xl border p-10 text-center" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
        <p style={{ color: 'var(--t-text-muted)' }}>
          No trending data published yet — the first rollup run hasn&apos;t completed.
        </p>
      </div>
    )
  }

  const [weeks, overview, tools, mcpServers] = await Promise.all([
    listWeeks(),
    readOverview(week),
    readTrendingTools(week),
    readMcpRanking(week),
  ])

  return (
    <TrendingWeekView
      week={week}
      weeks={weeks}
      overview={overview}
      tools={tools}
      mcpServers={mcpServers}
    />
  )
}
