import { NextResponse } from 'next/server'
import { queryTopicTrends } from '@/lib/queries'
import { parsePeriod } from '@/lib/parse-period'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = parsePeriod(searchParams.get('period'))

  const topics = await queryTopicTrends(period)

  return NextResponse.json({ topics }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
