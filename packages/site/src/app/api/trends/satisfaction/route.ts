import { NextResponse } from 'next/server'
import { querySatisfactionTrend } from '@/lib/queries'
import { parsePeriod } from '@/lib/parse-period'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = parsePeriod(searchParams.get('period'), '90d')

  const data = await querySatisfactionTrend(period)

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
