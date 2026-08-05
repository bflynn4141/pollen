import { getDb } from './neon'
import { currentWeek, isoWeekStart, recentWeeks, shiftWeek } from './week'

/**
 * Recompute k-anonymized rollup cells. This module is the ONLY path that reads
 * raw tables for public surfaces; the site's /trending pages and every
 * /api/v1 endpoint (site + pollen-api worker) read exclusively from
 * rollup_cells via rollup-queries.ts.
 *
 * Every query suppresses cells with fewer than K distinct contributors via
 * HAVING at write time, and residual NULL-contributor rows are excluded so
 * they can never leak into a public cell.
 *
 * Periods: ISO weeks as IYYY-"W"IW (2026-W32), days as YYYY-MM-DD.
 * Recompute covers a rolling window of WINDOW_WEEKS; older cells are frozen
 * (never deleted, never rewritten) so week permalinks stay citable and
 * history stays sellable.
 */

export const K = 5
export const WINDOW_WEEKS = 8

// Weekly rollup names recomputed each run (daily series handled separately).
const WEEKLY_ROLLUPS = ['tool_calls', 'mcp_server_calls', 'network_overview', 'mcp_co_usage']

// tool_events.timestamp / sessions.started_at are unix-ms BIGINTs.
// to_timestamp(x / 1000.0) AT TIME ZONE 'UTC' yields a UTC wall-clock
// timestamp, so to_char(..., 'IYYY-"W"IW') buckets by UTC ISO week.

export async function computeRollups(now: Date = new Date()): Promise<number> {
  const sql = getDb()
  let cells = 0

  const weeks = recentWeeks(WINDOW_WEEKS, now)
  const windowStartMs = isoWeekStart(weeks[weeks.length - 1]).getTime()
  const windowStartDay = new Date(windowStartMs).toISOString().slice(0, 10)

  // Delete-first inside the window so cells that no longer qualify (data
  // re-synced, k threshold raised, query changed) don't linger as stale
  // results. Cells outside the window are frozen.
  await sql`
    DELETE FROM rollup_cells
    WHERE rollup = ANY(${WEEKLY_ROLLUPS}) AND period = ANY(${weeks})`
  await sql`
    DELETE FROM rollup_cells
    WHERE rollup = 'tool_daily_series' AND period >= ${windowStartDay}`

  async function write(
    rollup: string,
    rows: Array<{ period: string; dims: object; value: object; contributors: number }>,
  ) {
    for (const row of rows) {
      await sql`
        INSERT INTO rollup_cells (rollup, period, dims, value, contributors, computed_at)
        VALUES (${rollup}, ${row.period}, ${JSON.stringify(row.dims)}, ${JSON.stringify(row.value)}, ${row.contributors}, now())
        ON CONFLICT (rollup, period, dims) DO UPDATE
        SET value = EXCLUDED.value, contributors = EXCLUDED.contributors, computed_at = now()`
      cells++
    }
  }

  // --- tool_calls: per-week usage of every tool (built-in + MCP) ------------
  const toolCalls = await sql`
    SELECT to_char(to_timestamp(timestamp / 1000.0) AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS period,
           tool_name,
           CASE WHEN tool_name LIKE 'mcp\\_\\_%' THEN 'mcp' ELSE 'builtin' END AS kind,
           mcp_server,
           COUNT(*)::int AS calls,
           COUNT(DISTINCT session_id)::int AS sessions,
           ROUND(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END), 3)::float AS success_rate,
           COUNT(DISTINCT contributor_id)::int AS contributors
    FROM tool_events
    WHERE timestamp > ${windowStartMs} AND contributor_id IS NOT NULL
    GROUP BY 1, 2, 3, 4
    HAVING COUNT(DISTINCT contributor_id) >= ${K}`
  await write('tool_calls', toolCalls.map(r => ({
    period: String(r.period),
    dims: {
      tool: r.tool_name,
      kind: r.kind,
      ...(r.mcp_server ? { server: r.mcp_server } : {}),
    },
    value: { calls: r.calls, sessions: r.sessions, success_rate: r.success_rate },
    contributors: Number(r.contributors),
  })))

  // --- mcp_server_calls: per-week adoption of each MCP server ---------------
  const mcpCalls = await sql`
    SELECT to_char(to_timestamp(timestamp / 1000.0) AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS period,
           mcp_server,
           COUNT(*)::int AS calls,
           COUNT(DISTINCT session_id)::int AS sessions,
           ROUND(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END), 3)::float AS success_rate,
           COUNT(DISTINCT contributor_id)::int AS contributors
    FROM tool_events
    WHERE mcp_server IS NOT NULL
      AND timestamp > ${windowStartMs} AND contributor_id IS NOT NULL
    GROUP BY 1, 2
    HAVING COUNT(DISTINCT contributor_id) >= ${K}`
  await write('mcp_server_calls', mcpCalls.map(r => ({
    period: String(r.period),
    dims: { server: r.mcp_server },
    value: { calls: r.calls, sessions: r.sessions, success_rate: r.success_rate },
    contributors: Number(r.contributors),
  })))

  // --- tool_daily_series: daily call counts per tool (sparklines) -----------
  const dailySeries = await sql`
    SELECT to_char(to_timestamp(timestamp / 1000.0) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS period,
           tool_name,
           COUNT(*)::int AS calls,
           COUNT(DISTINCT contributor_id)::int AS contributors
    FROM tool_events
    WHERE timestamp > ${windowStartMs} AND contributor_id IS NOT NULL
    GROUP BY 1, 2
    HAVING COUNT(DISTINCT contributor_id) >= ${K}`
  await write('tool_daily_series', dailySeries.map(r => ({
    period: String(r.period),
    dims: { tool: r.tool_name },
    value: { calls: r.calls },
    contributors: Number(r.contributors),
  })))

  // --- network_overview: one cell per week, whole-network aggregates --------
  const overview = await sql`
    SELECT to_char(to_timestamp(timestamp / 1000.0) AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS period,
           COUNT(*)::int AS tool_calls,
           COUNT(DISTINCT session_id)::int AS sessions,
           COUNT(DISTINCT tool_name)::int AS tools,
           COUNT(DISTINCT mcp_server)::int AS mcp_servers,
           COUNT(DISTINCT contributor_id)::int AS contributors
    FROM tool_events
    WHERE timestamp > ${windowStartMs} AND contributor_id IS NOT NULL
    GROUP BY 1
    HAVING COUNT(DISTINCT contributor_id) >= ${K}`
  await write('network_overview', overview.map(r => ({
    period: String(r.period),
    dims: {},
    value: {
      tool_calls: r.tool_calls,
      sessions: r.sessions,
      tools: r.tools,
      mcp_servers: r.mcp_servers,
    },
    contributors: Number(r.contributors),
  })))

  // --- mcp_co_usage: pairs of MCP servers used in the same session ----------
  const coUsage = await sql`
    WITH servers AS (
      SELECT s.session_id, s.contributor_id,
             to_char(to_timestamp(s.started_at / 1000.0) AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS period,
             server.value AS server
      FROM sessions s, jsonb_array_elements_text(s.mcp_servers_used::jsonb) AS server(value)
      WHERE s.mcp_servers_used IS NOT NULL
        AND s.contributor_id IS NOT NULL
        AND s.started_at > ${windowStartMs}
    )
    SELECT a.period, a.server AS server_a, b.server AS server_b,
           COUNT(DISTINCT a.session_id)::int AS sessions,
           COUNT(DISTINCT a.contributor_id)::int AS contributors
    FROM servers a
    JOIN servers b ON a.session_id = b.session_id AND a.period = b.period AND a.server < b.server
    GROUP BY 1, 2, 3
    HAVING COUNT(DISTINCT a.contributor_id) >= ${K}`
  await write('mcp_co_usage', coUsage.map(r => ({
    period: String(r.period),
    dims: { server_a: r.server_a, server_b: r.server_b },
    value: { sessions: r.sessions },
    contributors: Number(r.contributors),
  })))

  // --- hard invariant: no cell below K may exist, ever ----------------------
  const bad = await sql`SELECT COUNT(*)::int AS c FROM rollup_cells WHERE contributors < ${K}`
  if (Number(bad[0].c) > 0) {
    throw new Error(
      `k-anonymity invariant violated: ${bad[0].c} rollup cell(s) with contributors < ${K}. ` +
      'Aborting — do not serve these cells.',
    )
  }

  return cells
}

/** The week most recently completed relative to `now` (last full ISO week). */
export function lastClosedWeek(now: Date = new Date()): string {
  return shiftWeek(currentWeek(now), -1)
}
