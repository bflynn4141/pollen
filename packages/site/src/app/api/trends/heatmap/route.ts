import { NextResponse } from 'next/server'
import { queryHeatmap } from '@/lib/queries'

export async function GET() {
  const data = await queryHeatmap()

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
