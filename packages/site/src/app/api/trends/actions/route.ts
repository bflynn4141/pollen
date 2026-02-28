import { NextResponse } from 'next/server'
import { queryActionTrends } from '@/lib/queries'
import type { Period } from '@/lib/trends'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = (searchParams.get('period') ?? '30d') as Period

  const actions = await queryActionTrends(period)

  return NextResponse.json({ actions }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
