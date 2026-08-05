import { NextResponse } from 'next/server'
import { queryToolRanking, queryTopToolSeries } from '@/lib/queries'
import { latestWeek, readMcpRanking } from '@pollen/data'
import { parsePeriod } from '@/lib/parse-period'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = parsePeriod(searchParams.get('period'))

  const week = await latestWeek().catch(() => null)
  const [tools, mcpRanking, topToolSeries] = await Promise.all([
    queryToolRanking(period),
    week ? readMcpRanking(week) : Promise.resolve([]),
    queryTopToolSeries(period),
  ])

  // MCP server naming comes from the k-anonymized rollup layer (latest
  // published week); success_rate adapted from 0–1 float to 0–100.
  const mcpServers = mcpRanking.map(s => ({
    mcp_server: s.server,
    count: s.calls,
    success_rate: s.successPct,
  }))

  return NextResponse.json({ tools, mcpServers, topToolSeries }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
  })
}
