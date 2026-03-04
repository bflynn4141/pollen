import { NextResponse } from 'next/server'
import { queryCompare } from '@/lib/queries'
import { parsePeriod } from '@/lib/parse-period'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = parsePeriod(searchParams.get('period'))
  const items = searchParams.get('items')?.split(',').filter(Boolean) ?? []
  const type = (searchParams.get('type') ?? 'topics') as 'topics' | 'actions' | 'tools'

  if (items.length === 0) {
    return NextResponse.json({ items: [] })
  }

  const data = await queryCompare(items, type, period)

  return NextResponse.json({ items: data }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
