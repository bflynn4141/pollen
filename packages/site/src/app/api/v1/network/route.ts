import { NextResponse } from 'next/server'
import {
  K_ANONYMITY,
  listReceiptWeeks,
  readReceiptNetwork,
  readReceiptNetworkWindows,
} from '@pollen/data'

// Privacy-closed production receipt snapshot. Empty while the founding panel
// is below K; this route never queries or returns raw receipt rows.
export const dynamic = 'force-dynamic'

export async function GET() {
  const weeks = (await listReceiptWeeks()).slice(0, 2)
  const [data, windows] = await Promise.all([
    Promise.all(weeks.map(week => readReceiptNetwork(week))),
    readReceiptNetworkWindows(),
  ])
  const live = Object.values(windows).some(window => window.current !== null)

  return NextResponse.json(
    {
      source: 'network_receipts',
      k_anonymity: K_ANONYMITY,
      status: live ? 'live' : 'warming_up',
      windows,
      weeks: data.filter(Boolean),
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}
