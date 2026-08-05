import { NextResponse } from 'next/server'
import { K_ANONYMITY, listWeeks, readOverview } from '@pollen/data'

// Free adoption endpoint: network-wide totals for the latest two published
// weeks (calls, sessions, distinct tools/servers, contributor count).
export const dynamic = 'force-dynamic'

export async function GET() {
  const weeks = (await listWeeks()).slice(0, 2)
  const data = await Promise.all(weeks.map(week => readOverview(week)))

  return NextResponse.json(
    { k_anonymity: K_ANONYMITY, weeks: data.filter(Boolean) },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}
