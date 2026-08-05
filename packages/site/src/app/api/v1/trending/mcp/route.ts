import { NextResponse } from 'next/server'
import { K_ANONYMITY, listWeeks, readMcpRanking } from '@pollen/data'

// Free adoption endpoint: MCP server ranking for the latest two published
// weeks. Every row is a k-anonymized rollup cell (>= 5 contributors).
export const dynamic = 'force-dynamic'

export async function GET() {
  const weeks = (await listWeeks()).slice(0, 2)
  const data = await Promise.all(
    weeks.map(async week => ({ week, servers: await readMcpRanking(week) })),
  )

  return NextResponse.json(
    { k_anonymity: K_ANONYMITY, weeks: data },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}
