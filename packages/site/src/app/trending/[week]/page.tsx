import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  listWeeks,
  readMcpRanking,
  readOverview,
  readTrendingTools,
} from '@pollen/data'
import { isValidWeek, weekRangeLabel } from '@pollen/data'
import TrendingWeekView from '../TrendingWeekView'

// Citable per-week permalink. Weeks outside the recompute window are frozen,
// so these pages are stable. Reads ONLY the k-anonymized rollup layer.
export const revalidate = 3600
export const dynamicParams = true

interface Props {
  params: Promise<{ week: string }>
}

export async function generateStaticParams() {
  try {
    const weeks = await listWeeks()
    return weeks.map(week => ({ week }))
  } catch {
    // No database at build time — render on demand instead.
    return []
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { week } = await params
  if (!isValidWeek(week)) return {}
  return {
    title: `Trending Tool Calls — ${week} — Pollen`,
    description: `What tools and MCP servers coding agents called during ${weekRangeLabel(week)}. K-anonymized (>=5 contributors per cell).`,
  }
}

export default async function TrendingWeekPage({ params }: Props) {
  const { week } = await params
  if (!isValidWeek(week)) notFound()

  // .catch → 404 for unpublished weeks even when the rollup table doesn't
  // exist yet (pre-migration deploys).
  const [weeks, overview, tools, mcpServers] = await Promise.all([
    listWeeks().catch(() => [] as string[]),
    readOverview(week).catch(() => null),
    readTrendingTools(week).catch(() => []),
    readMcpRanking(week).catch(() => []),
  ])

  if (!weeks.includes(week)) notFound()

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
