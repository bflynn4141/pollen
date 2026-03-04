import { NextResponse } from 'next/server'
import { querySubjectExplore } from '@/lib/queries'
import { parsePeriod } from '@/lib/parse-period'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')?.trim()
  const period = parsePeriod(searchParams.get('period'), 'all')

  if (!query || query.length > 200) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  }

  const data = await querySubjectExplore(query, period)

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
