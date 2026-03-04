import { getDb } from './neon'
import type {
  Period, TimePoint, OverviewResponse, TopicTrendItem, ActionTrendItem,
  ToolRankItem, McpRankItem, HeatmapCell, SessionArc, SessionListItem,
  CompareItem, SubjectExploreResponse, SubjectAutocompleteItem,
  SubjectTrendingItem, SubjectSessionItem, DashboardItem,
} from './trends'
import { periodToMs, bucketInterval } from './parse-period'

// ── Overview ──

export async function queryOverview(period: Period): Promise<OverviewResponse> {
  const sql = getDb()
  const cutoff = periodToMs(period)
  const tsFilter = cutoff ? `WHERE timestamp > ${cutoff}` : ''
  const sessionTsFilter = cutoff ? `WHERE started_at > ${cutoff}` : ''

  const [prompts, sessions, tools, topTopic, topAction, topTool, satisfaction, sparkline] = await Promise.all([
    sql`SELECT COUNT(*) as c FROM contributions ${cutoff ? sql`WHERE timestamp > ${cutoff}` : sql``}`,
    sql`SELECT COUNT(*) as c FROM sessions ${cutoff ? sql`WHERE started_at > ${cutoff}` : sql``}`,
    sql`SELECT COUNT(*) as c FROM tool_events ${cutoff ? sql`WHERE timestamp > ${cutoff}` : sql``}`,
    sql`SELECT topic as name, COUNT(*) as count FROM contributions WHERE topic IS NOT NULL ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``} GROUP BY topic ORDER BY count DESC LIMIT 1`,
    sql`SELECT action as name, COUNT(*) as count FROM contributions WHERE action IS NOT NULL ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``} GROUP BY action ORDER BY count DESC LIMIT 1`,
    sql`SELECT tool_name as name, COUNT(*) as count FROM tool_events ${cutoff ? sql`WHERE timestamp > ${cutoff}` : sql``} GROUP BY tool_name ORDER BY count DESC LIMIT 1`,
    sql`SELECT ROUND(AVG(satisfaction_score)) as avg FROM sessions WHERE satisfaction_score IS NOT NULL ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}`,
    sql`SELECT to_char(date_trunc('day', to_timestamp(timestamp / 1000)), 'YYYY-MM-DD') as date, COUNT(*) as count FROM contributions ${cutoff ? sql`WHERE timestamp > ${cutoff}` : sql``} GROUP BY date ORDER BY date`,
  ])

  return {
    totalPrompts: Number(prompts[0].c),
    totalSessions: Number(sessions[0].c),
    totalToolEvents: Number(tools[0].c),
    avgSatisfaction: satisfaction[0].avg != null ? Number(satisfaction[0].avg) : null,
    topTopic: topTopic[0] ? { name: topTopic[0].name as string, count: Number(topTopic[0].count) } : null,
    topAction: topAction[0] ? { name: topAction[0].name as string, count: Number(topAction[0].count) } : null,
    topTool: topTool[0] ? { name: topTool[0].name as string, count: Number(topTool[0].count) } : null,
    sparkline: sparkline.map(r => ({ date: r.date as string, count: Number(r.count) })),
  }
}

// ── Topics ──

export async function queryTopicTrends(period: Period): Promise<TopicTrendItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)
  const interval = bucketInterval(period)

  const rows = await sql`
    SELECT topic,
      to_char(date_trunc(${interval}, to_timestamp(timestamp / 1000)), 'YYYY-MM-DD') as date,
      COUNT(*) as count
    FROM contributions
    WHERE topic IS NOT NULL ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``}
    GROUP BY topic, date
    ORDER BY topic, date
  `

  const map = new Map<string, { total: number; series: TimePoint[] }>()
  for (const r of rows) {
    const topic = r.topic as string
    if (!map.has(topic)) map.set(topic, { total: 0, series: [] })
    const entry = map.get(topic)!
    const count = Number(r.count)
    entry.total += count
    entry.series.push({ date: r.date as string, count })
  }

  return Array.from(map.entries())
    .map(([topic, data]) => ({ topic, ...data }))
    .sort((a, b) => b.total - a.total)
}

// ── Actions ──

export async function queryActionTrends(period: Period): Promise<ActionTrendItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)
  const interval = bucketInterval(period)

  const rows = await sql`
    SELECT action,
      to_char(date_trunc(${interval}, to_timestamp(timestamp / 1000)), 'YYYY-MM-DD') as date,
      COUNT(*) as count
    FROM contributions
    WHERE action IS NOT NULL ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``}
    GROUP BY action, date
    ORDER BY action, date
  `

  const map = new Map<string, { total: number; series: TimePoint[] }>()
  for (const r of rows) {
    const action = r.action as string
    if (!map.has(action)) map.set(action, { total: 0, series: [] })
    const entry = map.get(action)!
    const count = Number(r.count)
    entry.total += count
    entry.series.push({ date: r.date as string, count })
  }

  return Array.from(map.entries())
    .map(([action, data]) => ({ action, ...data }))
    .sort((a, b) => b.total - a.total)
}

// ── Tools ──

export async function queryToolRanking(period: Period): Promise<ToolRankItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)

  // Get current period counts
  const rows = await sql`
    SELECT tool_name,
      COUNT(*) as count,
      ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*)) as success_rate
    FROM tool_events
    ${cutoff ? sql`WHERE timestamp > ${cutoff}` : sql``}
    GROUP BY tool_name
    ORDER BY count DESC
  `

  // Get previous period counts for trend calculation
  let prevMap = new Map<string, number>()
  if (cutoff) {
    const prevCutoff = cutoff - (Date.now() - cutoff) // same-length previous window
    const prevRows = await sql`
      SELECT tool_name, COUNT(*) as count
      FROM tool_events
      WHERE timestamp > ${prevCutoff} AND timestamp <= ${cutoff}
      GROUP BY tool_name
    `
    for (const r of prevRows) {
      prevMap.set(r.tool_name as string, Number(r.count))
    }
  }

  return rows.map(r => {
    const name = r.tool_name as string
    const count = Number(r.count)
    const prev = prevMap.get(name) ?? 0
    let trend: 'up' | 'down' | 'stable' = 'stable'
    if (prev > 0) {
      const change = (count - prev) / prev
      if (change > 0.1) trend = 'up'
      else if (change < -0.1) trend = 'down'
    } else if (count > 0) {
      trend = 'up'
    }
    return { tool_name: name, count, success_rate: Number(r.success_rate), trend }
  })
}

export async function queryMcpRanking(period: Period): Promise<McpRankItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)

  const rows = await sql`
    SELECT mcp_server,
      COUNT(*) as count,
      ROUND(100.0 * SUM(CASE WHEN success THEN 1 ELSE 0 END) / COUNT(*)) as success_rate
    FROM tool_events
    WHERE mcp_server IS NOT NULL ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``}
    GROUP BY mcp_server
    ORDER BY count DESC
  `

  return rows.map(r => ({
    mcp_server: r.mcp_server as string,
    count: Number(r.count),
    success_rate: Number(r.success_rate),
  }))
}

export async function queryTopToolSeries(period: Period, limit = 5): Promise<{ tool_name: string; series: TimePoint[] }[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)
  const interval = bucketInterval(period)

  const topTools = await sql`
    SELECT tool_name FROM tool_events
    ${cutoff ? sql`WHERE timestamp > ${cutoff}` : sql``}
    GROUP BY tool_name ORDER BY COUNT(*) DESC LIMIT ${limit}
  `
  const toolNames = topTools.map(r => r.tool_name as string)
  if (toolNames.length === 0) return []

  const rows = await sql`
    SELECT tool_name,
      to_char(date_trunc(${interval}, to_timestamp(timestamp / 1000)), 'YYYY-MM-DD') as date,
      COUNT(*) as count
    FROM tool_events
    WHERE tool_name = ANY(${toolNames}) ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``}
    GROUP BY tool_name, date
    ORDER BY tool_name, date
  `

  const map = new Map<string, TimePoint[]>()
  for (const name of toolNames) map.set(name, [])
  for (const r of rows) {
    map.get(r.tool_name as string)?.push({ date: r.date as string, count: Number(r.count) })
  }

  return toolNames.map(name => ({ tool_name: name, series: map.get(name)! }))
}

// ── Heatmap ──

export async function queryHeatmap(): Promise<{ cells: HeatmapCell[]; maxCount: number }> {
  const sql = getDb()

  const rows = await sql`
    SELECT
      EXTRACT(DOW FROM to_timestamp(timestamp / 1000)) as day,
      EXTRACT(HOUR FROM to_timestamp(timestamp / 1000)) as hour,
      COUNT(*) as count
    FROM tool_events
    GROUP BY day, hour
    ORDER BY day, hour
  `

  let maxCount = 0
  const cells = rows.map(r => {
    const count = Number(r.count)
    if (count > maxCount) maxCount = count
    return { day: Number(r.day), hour: Number(r.hour), count }
  })

  return { cells, maxCount }
}

// ── Satisfaction ──

export async function querySatisfactionTrend(period: Period) {
  const sql = getDb()
  const cutoff = periodToMs(period)
  const interval = bucketInterval(period)

  const [trend, signalRows, avg] = await Promise.all([
    sql`
      SELECT to_char(date_trunc(${interval}, to_timestamp(started_at / 1000)), 'YYYY-MM-DD') as date,
        ROUND(AVG(satisfaction_score)) as score
      FROM sessions
      WHERE satisfaction_score IS NOT NULL ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}
      GROUP BY date ORDER BY date
    `,
    sql`
      SELECT satisfaction_signals FROM sessions
      WHERE satisfaction_signals IS NOT NULL ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}
    `,
    sql`
      SELECT ROUND(AVG(satisfaction_score)) as avg FROM sessions
      WHERE satisfaction_score IS NOT NULL ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}
    `,
  ])

  // Aggregate signal counts
  const signalCounts: Record<string, number> = {}
  for (const row of signalRows) {
    const signals = row.satisfaction_signals as Record<string, boolean>
    for (const [key, value] of Object.entries(signals)) {
      if (value) signalCounts[key] = (signalCounts[key] ?? 0) + 1
    }
  }

  return {
    trend: trend.map(r => ({ date: r.date as string, score: Number(r.score) })),
    signals: Object.entries(signalCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    avgScore: avg[0].avg != null ? Number(avg[0].avg) : null,
  }
}

// ── Sessions ──

export async function querySessionArcs(period: Period): Promise<SessionArc[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)

  const rows = await sql`
    SELECT dominant_intent as intent, outcome, COUNT(*) as count
    FROM sessions
    WHERE dominant_intent IS NOT NULL AND outcome IS NOT NULL
    ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}
    GROUP BY dominant_intent, outcome
    ORDER BY count DESC
  `

  return rows.map(r => ({
    intent: r.intent as string,
    outcome: r.outcome as string,
    count: Number(r.count),
  }))
}

export async function queryRecentSessions(period: Period, limit = 50): Promise<SessionListItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)

  const rows = await sql`
    SELECT session_id, started_at, prompt_count, dominant_intent, outcome, satisfaction_score
    FROM sessions
    ${cutoff ? sql`WHERE started_at > ${cutoff}` : sql``}
    ORDER BY started_at DESC
    LIMIT ${limit}
  `

  return rows.map(r => ({
    session_id: r.session_id as string,
    started_at: Number(r.started_at),
    prompt_count: Number(r.prompt_count),
    dominant_intent: r.dominant_intent as string | null,
    outcome: r.outcome as string | null,
    satisfaction_score: r.satisfaction_score != null ? Number(r.satisfaction_score) : null,
  }))
}

// ── Compare ──

export async function queryCompare(items: string[], type: 'topics' | 'actions' | 'tools', period: Period): Promise<CompareItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)
  const interval = bucketInterval(period)

  if (type === 'tools') {
    const rows = await sql`
      SELECT tool_name as name,
        to_char(date_trunc(${interval}, to_timestamp(timestamp / 1000)), 'YYYY-MM-DD') as date,
        COUNT(*) as count
      FROM tool_events
      WHERE tool_name = ANY(${items}) ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``}
      GROUP BY name, date ORDER BY name, date
    `
    return aggregateCompareSeries(rows, items)
  }

  // Separate queries for topics vs actions (can't interpolate column names in Neon tagged templates)
  const rows = type === 'topics'
    ? await sql`
        SELECT topic as name,
          to_char(date_trunc(${interval}, to_timestamp(timestamp / 1000)), 'YYYY-MM-DD') as date,
          COUNT(*) as count
        FROM contributions
        WHERE topic = ANY(${items}) ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``}
        GROUP BY name, date ORDER BY name, date
      `
    : await sql`
        SELECT action as name,
          to_char(date_trunc(${interval}, to_timestamp(timestamp / 1000)), 'YYYY-MM-DD') as date,
          COUNT(*) as count
        FROM contributions
        WHERE action = ANY(${items}) ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``}
        GROUP BY name, date ORDER BY name, date
      `

  return aggregateCompareSeries(rows, items)
}

// ── Subject Explore ──

export async function querySubjectExplore(query: string, period: Period): Promise<SubjectExploreResponse> {
  const sql = getDb()
  const cutoff = periodToMs(period)
  const interval = bucketInterval(period)
  const pattern = `%${query}%`

  // Time series of matching sessions
  const seriesRows = await sql`
    SELECT to_char(date_trunc(${interval}, to_timestamp(started_at / 1000)), 'YYYY-MM-DD') as date,
      COUNT(*) as count
    FROM sessions
    WHERE subject ILIKE ${pattern} ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}
    GROUP BY date ORDER BY date
  `

  // Find max for normalization
  let maxCount = 0
  for (const r of seriesRows) {
    const c = Number(r.count)
    if (c > maxCount) maxCount = c
  }

  const series = seriesRows.map(r => {
    const count = Number(r.count)
    return {
      date: r.date as string,
      count,
      normalized: maxCount > 0 ? Math.round((count / maxCount) * 100) : 0,
    }
  })

  // Total count
  const totalRows = await sql`
    SELECT COUNT(*) as c FROM sessions
    WHERE subject ILIKE ${pattern} ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}
  `
  const totalSessions = Number(totalRows[0].c)

  // Related subjects: other subjects from sessions in the same timeframe
  const relatedRows = await sql`
    SELECT subject, COUNT(*) as count FROM sessions
    WHERE subject IS NOT NULL
      AND subject NOT ILIKE ${pattern}
      AND dominant_domain IN (
        SELECT DISTINCT dominant_domain FROM sessions
        WHERE subject ILIKE ${pattern} AND dominant_domain IS NOT NULL
      )
      ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}
    GROUP BY subject ORDER BY count DESC LIMIT 10
  `

  // Matching sessions
  const sessionRows = await sql`
    SELECT session_id, started_at, subject, prompt_count, dominant_intent, outcome
    FROM sessions
    WHERE subject ILIKE ${pattern} ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}
    ORDER BY started_at DESC LIMIT 50
  `

  return {
    query,
    totalSessions,
    series,
    relatedSubjects: relatedRows.map(r => ({
      subject: r.subject as string,
      count: Number(r.count),
    })),
    sessions: sessionRows.map(r => ({
      session_id: r.session_id as string,
      started_at: Number(r.started_at),
      subject: r.subject as string,
      prompt_count: Number(r.prompt_count),
      dominant_intent: r.dominant_intent as string | null,
      outcome: r.outcome as string | null,
    })),
  }
}

// ── Subject Autocomplete ──

export async function querySubjectAutocomplete(prefix: string): Promise<SubjectAutocompleteItem[]> {
  const sql = getDb()
  const pattern = `%${prefix}%`

  const rows = await sql`
    SELECT subject, COUNT(*) as count
    FROM sessions
    WHERE subject IS NOT NULL AND subject ILIKE ${pattern}
    GROUP BY subject
    ORDER BY count DESC
    LIMIT 10
  `

  return rows.map(r => ({
    subject: r.subject as string,
    count: Number(r.count),
  }))
}

// ── Subject Trending ──

export async function querySubjectTrending(period: Period): Promise<SubjectTrendingItem[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)

  // Current period counts
  const rows = await sql`
    SELECT subject, COUNT(*) as count
    FROM sessions
    WHERE subject IS NOT NULL AND subject != 'general'
      ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}
    GROUP BY subject
    ORDER BY count DESC
    LIMIT 20
  `

  // Previous period counts for growth calculation
  let prevMap = new Map<string, number>()
  if (cutoff) {
    const prevCutoff = cutoff - (Date.now() - cutoff)
    const prevRows = await sql`
      SELECT subject, COUNT(*) as count
      FROM sessions
      WHERE subject IS NOT NULL AND subject != 'general'
        AND started_at > ${prevCutoff} AND started_at <= ${cutoff}
      GROUP BY subject
    `
    for (const r of prevRows) {
      prevMap.set(r.subject as string, Number(r.count))
    }
  }

  return rows.map(r => {
    const subject = r.subject as string
    const count = Number(r.count)
    const prev = prevMap.get(subject) ?? 0
    let growth: number | null = null
    if (prev > 0) {
      growth = Math.round(((count - prev) / prev) * 100)
    }
    return { subject, count, growth }
  })
}

// ── Dashboard: Topics ──

export async function queryTopicDashboard(period: Period): Promise<DashboardItem[]> {
  try {
    const sql = getDb()
    const cutoff = periodToMs(period)

    const rows = await sql`
      SELECT topic as name, COUNT(*) as count
      FROM contributions
      WHERE topic IS NOT NULL ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``}
      GROUP BY topic
      ORDER BY count DESC
    `

    let prevMap = new Map<string, number>()
    if (cutoff) {
      const prevCutoff = cutoff - (Date.now() - cutoff)
      const prevRows = await sql`
        SELECT topic as name, COUNT(*) as count
        FROM contributions
        WHERE topic IS NOT NULL
          AND timestamp > ${prevCutoff} AND timestamp <= ${cutoff}
        GROUP BY topic
      `
      for (const r of prevRows) {
        prevMap.set(r.name as string, Number(r.count))
      }
    }

    return rows.map(r => {
      const name = r.name as string
      const count = Number(r.count)
      const prev = prevMap.get(name) ?? 0
      let trend: 'up' | 'down' | 'stable' = 'stable'
      let changePercent: number | null = null
      if (prev > 0) {
        changePercent = Math.round(((count - prev) / prev) * 100)
        if (changePercent > 10) trend = 'up'
        else if (changePercent < -10) trend = 'down'
      } else if (count > 0) {
        trend = 'up'
      }
      return { name, count, changePercent, trend }
    })
  } catch {
    return []
  }
}

// ── Dashboard: Tools ──

export async function queryToolDashboard(period: Period): Promise<DashboardItem[]> {
  try {
    const sql = getDb()
    const cutoff = periodToMs(period)

    const rows = await sql`
      SELECT tool_name as name, COUNT(*) as count
      FROM tool_events
      ${cutoff ? sql`WHERE timestamp > ${cutoff}` : sql``}
      GROUP BY tool_name
      ORDER BY count DESC
    `

    let prevMap = new Map<string, number>()
    if (cutoff) {
      const prevCutoff = cutoff - (Date.now() - cutoff)
      const prevRows = await sql`
        SELECT tool_name as name, COUNT(*) as count
        FROM tool_events
        WHERE timestamp > ${prevCutoff} AND timestamp <= ${cutoff}
        GROUP BY tool_name
      `
      for (const r of prevRows) {
        prevMap.set(r.name as string, Number(r.count))
      }
    }

    return rows.map(r => {
      const name = r.name as string
      const count = Number(r.count)
      const prev = prevMap.get(name) ?? 0
      let trend: 'up' | 'down' | 'stable' = 'stable'
      let changePercent: number | null = null
      if (prev > 0) {
        changePercent = Math.round(((count - prev) / prev) * 100)
        if (changePercent > 10) trend = 'up'
        else if (changePercent < -10) trend = 'down'
      } else if (count > 0) {
        trend = 'up'
      }
      return { name, count, changePercent, trend }
    })
  } catch {
    return []
  }
}

// ── Dashboard: Models ──

export async function queryModelUsage(period: Period): Promise<(DashboardItem & { model: string })[]> {
  try {
    const sql = getDb()
    const cutoff = periodToMs(period)

    const rows = await sql`
      SELECT model as name, COUNT(*) as count
      FROM sessions
      WHERE model IS NOT NULL ${cutoff ? sql`AND started_at > ${cutoff}` : sql``}
      GROUP BY model
      ORDER BY count DESC
    `

    let prevMap = new Map<string, number>()
    if (cutoff) {
      const prevCutoff = cutoff - (Date.now() - cutoff)
      const prevRows = await sql`
        SELECT model as name, COUNT(*) as count
        FROM sessions
        WHERE model IS NOT NULL
          AND started_at > ${prevCutoff} AND started_at <= ${cutoff}
        GROUP BY model
      `
      for (const r of prevRows) {
        prevMap.set(r.name as string, Number(r.count))
      }
    }

    return rows.map(r => {
      const name = r.name as string
      const count = Number(r.count)
      const prev = prevMap.get(name) ?? 0
      let trend: 'up' | 'down' | 'stable' = 'stable'
      let changePercent: number | null = null
      if (prev > 0) {
        changePercent = Math.round(((count - prev) / prev) * 100)
        if (changePercent > 10) trend = 'up'
        else if (changePercent < -10) trend = 'down'
      } else if (count > 0) {
        trend = 'up'
      }
      return { name, count, changePercent, trend, model: name }
    })
  } catch {
    return []
  }
}

// ── Dashboard: Commands ──

export async function queryCommandRanking(period: Period): Promise<(DashboardItem & { command_category: string })[]> {
  const sql = getDb()
  const cutoff = periodToMs(period)

  try {
    const rows = await sql`
      SELECT intent as name, COUNT(*) as count
      FROM contributions
      WHERE intent IS NOT NULL ${cutoff ? sql`AND timestamp > ${cutoff}` : sql``}
      GROUP BY intent
      ORDER BY count DESC
    `

    let prevMap = new Map<string, number>()
    if (cutoff) {
      const prevCutoff = cutoff - (Date.now() - cutoff)
      const prevRows = await sql`
        SELECT intent as name, COUNT(*) as count
        FROM contributions
        WHERE intent IS NOT NULL
          AND timestamp > ${prevCutoff} AND timestamp <= ${cutoff}
        GROUP BY intent
      `
      for (const r of prevRows) {
        prevMap.set(r.name as string, Number(r.count))
      }
    }

    return rows.map(r => {
      const name = r.name as string
      const count = Number(r.count)
      const prev = prevMap.get(name) ?? 0
      let trend: 'up' | 'down' | 'stable' = 'stable'
      let changePercent: number | null = null
      if (prev > 0) {
        changePercent = Math.round(((count - prev) / prev) * 100)
        if (changePercent > 10) trend = 'up'
        else if (changePercent < -10) trend = 'down'
      } else if (count > 0) {
        trend = 'up'
      }
      return { name, count, changePercent, trend, command_category: name }
    })
  } catch {
    return []
  }
}

function aggregateCompareSeries(rows: Record<string, unknown>[], items: string[]): CompareItem[] {
  const map = new Map<string, { total: number; series: TimePoint[] }>()
  for (const name of items) map.set(name, { total: 0, series: [] })

  for (const r of rows) {
    const name = r.name as string
    const count = Number(r.count)
    const entry = map.get(name)
    if (entry) {
      entry.total += count
      entry.series.push({ date: r.date as string, count })
    }
  }

  return items.map(name => {
    const data = map.get(name) ?? { total: 0, series: [] }
    return { name, ...data }
  })
}
