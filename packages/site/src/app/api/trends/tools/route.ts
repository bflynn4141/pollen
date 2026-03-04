import { NextResponse } from 'next/server'
import { queryToolRanking, queryMcpRanking, queryTopToolSeries } from '@/lib/queries'
import { parsePeriod } from '@/lib/parse-period'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = parsePeriod(searchParams.get('period'))

  const [tools, mcpServers, topToolSeries] = await Promise.all([
    queryToolRanking(period),
    queryMcpRanking(period),
    queryTopToolSeries(period),
  ])

  return NextResponse.json({ tools, mcpServers, topToolSeries }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
