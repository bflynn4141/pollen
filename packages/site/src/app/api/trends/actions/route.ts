import { NextResponse } from 'next/server'
import { queryActionTrends } from '@/lib/queries'
import { parsePeriod } from '@/lib/parse-period'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = parsePeriod(searchParams.get('period'))

  const actions = await queryActionTrends(period)

  return NextResponse.json({ actions }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
