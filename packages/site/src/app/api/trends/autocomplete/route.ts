import { NextResponse } from 'next/server'
import { querySubjectAutocomplete } from '@/lib/queries'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  if (!query) {
    return NextResponse.json([], {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
    })
  }

  const data = await querySubjectAutocomplete(query)

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' },
  })
}
