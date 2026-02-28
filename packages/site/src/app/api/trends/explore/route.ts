import { NextResponse } from 'next/server'
import { querySubjectExplore } from '@/lib/queries'
import type { Period } from '@/lib/trends'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')
  const period = (searchParams.get('period') ?? 'all') as Period

  if (!query) {
    return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 })
  }

  const data = await querySubjectExplore(query, period)

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
