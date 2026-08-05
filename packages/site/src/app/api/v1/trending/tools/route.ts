import { NextResponse } from 'next/server'
import { K_ANONYMITY, listWeeks, readTrendingTools } from '@pollen/data'

// Free adoption endpoint: trending tool calls for the latest two published
// weeks. Every row is a k-anonymized rollup cell (>= 5 contributors).
export const dynamic = 'force-dynamic'

export async function GET() {
  const weeks = (await listWeeks()).slice(0, 2)
  const data = await Promise.all(
    weeks.map(async week => ({ week, tools: await readTrendingTools(week) })),
  )

  return NextResponse.json(
    { k_anonymity: K_ANONYMITY, weeks: data },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}
