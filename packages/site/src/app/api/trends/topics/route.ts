import { NextResponse } from 'next/server'
import { queryTopicTrends } from '@/lib/queries'
import type { Period } from '@/lib/trends'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = (searchParams.get('period') ?? '30d') as Period

  const topics = await queryTopicTrends(period)

  return NextResponse.json({ topics }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
