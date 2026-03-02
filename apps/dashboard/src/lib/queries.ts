import { getDb } from './db'
import type { Period, RankItem } from './types'

function periodToMs(period: Period): number {
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  return Date.now() - days * 86400000
}

function computeTrend(count: number, prev: number): { trend: RankItem['trend']; changePercent: number | null } {
  if (prev > 0) {
    const changePercent = Math.round(((count - prev) / prev) * 100)
    const trend = changePercent > 10 ? 'up' as const : changePercent < -10 ? 'down' as const : 'stable' as const
    return { trend, changePercent }
  }
  if (count > 0) return { trend: 'up', changePercent: null }
  return { trend: 'stable', changePercent: null }
}

// ── Trigram similarity clustering ──

function trigrams(s: string): Set<string> {
  const padded = `  ${s.toLowerCase()} `
  const set = new Set<string>()
  for (let i = 0; i <= padded.length - 3; i++) {
    set.add(padded.slice(i, i + 3))
  }
  return set
}

function similarity(a: string, b: string): number {
  const ta = trigrams(a)
  const tb = trigrams(b)
  let intersection = 0
  for (const t of ta) {
    if (tb.has(t)) intersection++
  }
  const union = ta.size + tb.size - intersection
  return union === 0 ? 0 : intersection / union
}

const SIMILARITY_THRESHOLD = 0.65

function clusterCounts(rows: { name: string; count: number }[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.count - a.count)
  const leaders: { name: string; count: number }[] = []

  for (const row of sorted) {
    let merged = false
    for (const leader of leaders) {
      if (similarity(row.name, leader.name) >= SIMILARITY_THRESHOLD) {
        leader.count += row.count
        merged = true
        break
      }
    }
    if (!merged) {
      leaders.push({ name: row.name, count: row.count })
    }
  }

  return new Map(leaders.map(l => [l.name, l.count]))
}

// ── Intents ──

export async function queryIntentRanking(period: Period): Promise<RankItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)

  const [rows, prevRows] = await Promise.all([
    sql`
      SELECT subject as name, COUNT(*) as count
      FROM sessions
      WHERE subject IS NOT NULL AND started_at > ${cutoff}
      GROUP BY subject ORDER BY count DESC
    `,
    sql`
      SELECT subject as name, COUNT(*) as count
      FROM sessions
      WHERE subject IS NOT NULL
        AND started_at > ${cutoff - (Date.now() - cutoff)}
        AND started_at <= ${cutoff}
      GROUP BY subject
    `,
  ])

  const current = clusterCounts(rows.map(r => ({ name: r.name as string, count: Number(r.count) })))
  const prev = clusterCounts(prevRows.map(r => ({ name: r.name as string, count: Number(r.count) })))

  return [...current.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => {
      const { trend, changePercent } = computeTrend(count, prev.get(name) ?? 0)
      return { name, count, trend, changePercent }
    })
}

// ── Tools ──

export async function queryToolRanking(period: Period): Promise<RankItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)

  const [rows, prevRows] = await Promise.all([
    sql`
      SELECT tool_name as name, COUNT(*) as count
      FROM tool_events
      WHERE timestamp > ${cutoff}
      GROUP BY tool_name ORDER BY count DESC
    `,
    sql`
      SELECT tool_name as name, COUNT(*) as count
      FROM tool_events
      WHERE timestamp > ${cutoff - (Date.now() - cutoff)}
        AND timestamp <= ${cutoff}
      GROUP BY tool_name
    `,
  ])

  const prevMap = new Map(prevRows.map(r => [r.name as string, Number(r.count)]))

  return rows.map(r => {
    const name = r.name as string
    const count = Number(r.count)
    const { trend, changePercent } = computeTrend(count, prevMap.get(name) ?? 0)
    return { name, count, trend, changePercent }
  })
}

// ── Commands ──

export async function queryCommandRanking(period: Period): Promise<RankItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)

  const [rows, prevRows] = await Promise.all([
    sql`
      SELECT command_category as name, COUNT(*) as count
      FROM tool_events
      WHERE command_category IS NOT NULL AND timestamp > ${cutoff}
      GROUP BY command_category ORDER BY count DESC
    `,
    sql`
      SELECT command_category as name, COUNT(*) as count
      FROM tool_events
      WHERE command_category IS NOT NULL
        AND timestamp > ${cutoff - (Date.now() - cutoff)}
        AND timestamp <= ${cutoff}
      GROUP BY command_category
    `,
  ])

  const prevMap = new Map(prevRows.map(r => [r.name as string, Number(r.count)]))

  return rows.map(r => {
    const name = r.name as string
    const count = Number(r.count)
    const { trend, changePercent } = computeTrend(count, prevMap.get(name) ?? 0)
    return { name, count, trend, changePercent }
  })
}

// ── Models ──

export async function queryModelUsage(period: Period): Promise<RankItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)

  const [rows, prevRows] = await Promise.all([
    sql`
      SELECT model as name, COUNT(*) as count
      FROM sessions
      WHERE model IS NOT NULL AND started_at > ${cutoff}
      GROUP BY model ORDER BY count DESC
    `,
    sql`
      SELECT model as name, COUNT(*) as count
      FROM sessions
      WHERE model IS NOT NULL
        AND started_at > ${cutoff - (Date.now() - cutoff)}
        AND started_at <= ${cutoff}
      GROUP BY model
    `,
  ])

  const prevMap = new Map(prevRows.map(r => [r.name as string, Number(r.count)]))

  return rows.map(r => {
    const name = r.name as string
    const count = Number(r.count)
    const { trend, changePercent } = computeTrend(count, prevMap.get(name) ?? 0)
    return { name, count, trend, changePercent }
  })
}
