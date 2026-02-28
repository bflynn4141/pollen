import { NextResponse } from 'next/server'
import { querySessionArcs, queryRecentSessions } from '@/lib/queries'
import type { Period } from '@/lib/trends'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = (searchParams.get('period') ?? '30d') as Period

  const [arcs, recent] = await Promise.all([
    querySessionArcs(period),
    queryRecentSessions(period),
  ])

  return NextResponse.json({ arcs, recent }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
