import { getDb } from './neon'
import { receiptRollingWindows } from './receipt-windows'
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
const WEEKLY_ROLLUPS = [
  'tool_calls',
  'mcp_server_calls',
  'network_overview',
  'mcp_co_usage',
  'receipt_overview',
  'receipt_models',
  'receipt_tool_categories',
  'receipt_intents',
  'receipt_workflows',
]

const RECEIPT_ROLLUPS = [
  'receipt_overview',
  'receipt_models',
  'receipt_tool_categories',
  'receipt_intents',
  'receipt_workflows',
]

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

  // --- receipt_overview: privacy-closed network participation --------------
  // Network receipts are the production source of truth for new clients.
  // They contain only the coarsened fields accepted by the ingest boundary;
  // no prompts, arguments, source code, paths, or free text reach this query.
  const receiptOverview = await sql`
    SELECT to_char(to_timestamp(observed_at / 1000.0) AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS period,
           COUNT(*)::int AS sessions,
           COALESCE(SUM(cardinality(tool_category_sequence)), 0)::int AS category_events,
           ROUND(AVG(CASE WHEN terminal_state = 'completed' THEN 1.0 ELSE 0.0 END), 3)::float AS completion_rate,
           ROUND(AVG(CASE WHEN check_result = 'passed' THEN 1.0 ELSE 0.0 END), 3)::float AS check_pass_rate,
           COUNT(DISTINCT contributor_id)::int AS contributors
    FROM network_receipts
    WHERE observed_at > ${windowStartMs}
    GROUP BY 1
    HAVING COUNT(DISTINCT contributor_id) >= ${K}`
  await write('receipt_overview', receiptOverview.map(r => ({
    period: String(r.period),
    dims: {},
    value: {
      sessions: r.sessions,
      category_events: r.category_events,
      completion_rate: r.completion_rate,
      check_pass_rate: r.check_pass_rate,
    },
    contributors: Number(r.contributors),
  })))

  // --- receipt_models: model adoption and observed outcomes ----------------
  const receiptModels = await sql`
    SELECT to_char(to_timestamp(observed_at / 1000.0) AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS period,
           agent,
           model,
           COUNT(*)::int AS sessions,
           ROUND(AVG(CASE WHEN terminal_state = 'completed' THEN 1.0 ELSE 0.0 END), 3)::float AS completion_rate,
           ROUND(AVG(CASE WHEN check_result = 'passed' THEN 1.0 ELSE 0.0 END), 3)::float AS check_pass_rate,
           COUNT(DISTINCT contributor_id)::int AS contributors
    FROM network_receipts
    WHERE observed_at > ${windowStartMs}
    GROUP BY 1, 2, 3
    HAVING COUNT(DISTINCT contributor_id) >= ${K}`
  await write('receipt_models', receiptModels.map(r => ({
    period: String(r.period),
    dims: { agent: r.agent, model: r.model },
    value: {
      sessions: r.sessions,
      completion_rate: r.completion_rate,
      check_pass_rate: r.check_pass_rate,
    },
    contributors: Number(r.contributors),
  })))

  // --- receipt_tool_categories: coarsened capability usage -----------------
  const receiptCategories = await sql`
    SELECT to_char(to_timestamp(r.observed_at / 1000.0) AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS period,
           category,
           COUNT(*)::int AS events,
           COUNT(DISTINCT r.receipt_id)::int AS sessions,
           ROUND(AVG(CASE WHEN r.terminal_state = 'completed' THEN 1.0 ELSE 0.0 END), 3)::float AS completion_rate,
           ROUND(AVG(CASE WHEN r.check_result = 'passed' THEN 1.0 ELSE 0.0 END), 3)::float AS check_pass_rate,
           COUNT(DISTINCT r.contributor_id)::int AS contributors
    FROM network_receipts r,
         unnest(r.tool_category_sequence) AS category
    WHERE r.observed_at > ${windowStartMs}
    GROUP BY 1, 2
    HAVING COUNT(DISTINCT r.contributor_id) >= ${K}`
  await write('receipt_tool_categories', receiptCategories.map(r => ({
    period: String(r.period),
    dims: { category: r.category },
    value: {
      events: r.events,
      sessions: r.sessions,
      completion_rate: r.completion_rate,
      check_pass_rate: r.check_pass_rate,
    },
    contributors: Number(r.contributors),
  })))

  // --- receipt_intents: classified jobs delegated to agents ----------------
  const receiptIntents = await sql`
    SELECT to_char(to_timestamp(observed_at / 1000.0) AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS period,
           intent,
           COUNT(*)::int AS sessions,
           ROUND(AVG(CASE WHEN terminal_state = 'completed' THEN 1.0 ELSE 0.0 END), 3)::float AS completion_rate,
           ROUND(AVG(CASE WHEN check_result = 'passed' THEN 1.0 ELSE 0.0 END), 3)::float AS check_pass_rate,
           COUNT(DISTINCT contributor_id)::int AS contributors
    FROM network_receipts
    WHERE observed_at > ${windowStartMs}
    GROUP BY 1, 2
    HAVING COUNT(DISTINCT contributor_id) >= ${K}`
  await write('receipt_intents', receiptIntents.map(r => ({
    period: String(r.period),
    dims: { intent: r.intent },
    value: {
      sessions: r.sessions,
      completion_rate: r.completion_rate,
      check_pass_rate: r.check_pass_rate,
    },
    contributors: Number(r.contributors),
  })))

  // --- receipt_workflows: exact coarsened category sequences ---------------
  const receiptWorkflows = await sql`
    SELECT to_char(to_timestamp(observed_at / 1000.0) AT TIME ZONE 'UTC', 'IYYY-"W"IW') AS period,
           array_to_string(tool_category_sequence, '>') AS sequence,
           COUNT(*)::int AS sessions,
           ROUND(AVG(CASE WHEN terminal_state = 'completed' THEN 1.0 ELSE 0.0 END), 3)::float AS completion_rate,
           ROUND(AVG(CASE WHEN check_result = 'passed' THEN 1.0 ELSE 0.0 END), 3)::float AS check_pass_rate,
           COUNT(DISTINCT contributor_id)::int AS contributors
    FROM network_receipts
    WHERE observed_at > ${windowStartMs}
    GROUP BY 1, 2
    HAVING COUNT(DISTINCT contributor_id) >= ${K}`
  await write('receipt_workflows', receiptWorkflows.map(r => ({
    period: String(r.period),
    dims: { sequence: r.sequence },
    value: {
      sessions: r.sessions,
      completion_rate: r.completion_rate,
      check_pass_rate: r.check_pass_rate,
    },
    contributors: Number(r.contributors),
  })))

  // --- rolling receipt windows: dashboard 24h / 7d / 30d + comparisons ---
  // These are recomputed as one query per ranking family. A receipt can join
  // several windows, but each published cell independently clears K.
  const [h24Current, h24Previous, d7Current, d7Previous, d30Current, d30Previous] = receiptRollingWindows(now)
  await sql`
    DELETE FROM rollup_cells
    WHERE rollup = ANY(${RECEIPT_ROLLUPS}) AND period LIKE 'rolling:%'`

  const rollingOverview = await sql`
    WITH periods(period, start_ms, end_ms) AS (VALUES
      ('rolling:24h:current', ${h24Current.startMs}::bigint, ${h24Current.endMs}::bigint),
      ('rolling:24h:previous', ${h24Previous.startMs}::bigint, ${h24Previous.endMs}::bigint),
      ('rolling:7d:current', ${d7Current.startMs}::bigint, ${d7Current.endMs}::bigint),
      ('rolling:7d:previous', ${d7Previous.startMs}::bigint, ${d7Previous.endMs}::bigint),
      ('rolling:30d:current', ${d30Current.startMs}::bigint, ${d30Current.endMs}::bigint),
      ('rolling:30d:previous', ${d30Previous.startMs}::bigint, ${d30Previous.endMs}::bigint)
    )
    SELECT p.period,
           COUNT(*)::int AS sessions,
           COALESCE(SUM(cardinality(r.tool_category_sequence)), 0)::int AS category_events,
           ROUND(AVG(CASE WHEN r.terminal_state = 'completed' THEN 1.0 ELSE 0.0 END), 3)::float AS completion_rate,
           ROUND(AVG(CASE WHEN r.check_result = 'passed' THEN 1.0 ELSE 0.0 END), 3)::float AS check_pass_rate,
           COUNT(DISTINCT r.contributor_id)::int AS contributors
    FROM periods p
    JOIN network_receipts r ON r.observed_at >= p.start_ms AND r.observed_at < p.end_ms
    GROUP BY 1
    HAVING COUNT(DISTINCT r.contributor_id) >= ${K}`
  await write('receipt_overview', rollingOverview.map(r => ({
    period: String(r.period),
    dims: {},
    value: {
      sessions: r.sessions,
      category_events: r.category_events,
      completion_rate: r.completion_rate,
      check_pass_rate: r.check_pass_rate,
    },
    contributors: Number(r.contributors),
  })))

  const rollingModels = await sql`
    WITH periods(period, start_ms, end_ms) AS (VALUES
      ('rolling:24h:current', ${h24Current.startMs}::bigint, ${h24Current.endMs}::bigint),
      ('rolling:24h:previous', ${h24Previous.startMs}::bigint, ${h24Previous.endMs}::bigint),
      ('rolling:7d:current', ${d7Current.startMs}::bigint, ${d7Current.endMs}::bigint),
      ('rolling:7d:previous', ${d7Previous.startMs}::bigint, ${d7Previous.endMs}::bigint),
      ('rolling:30d:current', ${d30Current.startMs}::bigint, ${d30Current.endMs}::bigint),
      ('rolling:30d:previous', ${d30Previous.startMs}::bigint, ${d30Previous.endMs}::bigint)
    )
    SELECT p.period, r.agent, r.model,
           COUNT(*)::int AS sessions,
           ROUND(AVG(CASE WHEN r.terminal_state = 'completed' THEN 1.0 ELSE 0.0 END), 3)::float AS completion_rate,
           ROUND(AVG(CASE WHEN r.check_result = 'passed' THEN 1.0 ELSE 0.0 END), 3)::float AS check_pass_rate,
           COUNT(DISTINCT r.contributor_id)::int AS contributors
    FROM periods p
    JOIN network_receipts r ON r.observed_at >= p.start_ms AND r.observed_at < p.end_ms
    GROUP BY 1, 2, 3
    HAVING COUNT(DISTINCT r.contributor_id) >= ${K}`
  await write('receipt_models', rollingModels.map(r => ({
    period: String(r.period),
    dims: { agent: r.agent, model: r.model },
    value: {
      sessions: r.sessions,
      completion_rate: r.completion_rate,
      check_pass_rate: r.check_pass_rate,
    },
    contributors: Number(r.contributors),
  })))

  const rollingCategories = await sql`
    WITH periods(period, start_ms, end_ms) AS (VALUES
      ('rolling:24h:current', ${h24Current.startMs}::bigint, ${h24Current.endMs}::bigint),
      ('rolling:24h:previous', ${h24Previous.startMs}::bigint, ${h24Previous.endMs}::bigint),
      ('rolling:7d:current', ${d7Current.startMs}::bigint, ${d7Current.endMs}::bigint),
      ('rolling:7d:previous', ${d7Previous.startMs}::bigint, ${d7Previous.endMs}::bigint),
      ('rolling:30d:current', ${d30Current.startMs}::bigint, ${d30Current.endMs}::bigint),
      ('rolling:30d:previous', ${d30Previous.startMs}::bigint, ${d30Previous.endMs}::bigint)
    )
    SELECT p.period, category,
           COUNT(*)::int AS events,
           COUNT(DISTINCT r.receipt_id)::int AS sessions,
           ROUND(AVG(CASE WHEN r.terminal_state = 'completed' THEN 1.0 ELSE 0.0 END), 3)::float AS completion_rate,
           ROUND(AVG(CASE WHEN r.check_result = 'passed' THEN 1.0 ELSE 0.0 END), 3)::float AS check_pass_rate,
           COUNT(DISTINCT r.contributor_id)::int AS contributors
    FROM periods p
    JOIN network_receipts r ON r.observed_at >= p.start_ms AND r.observed_at < p.end_ms,
         unnest(r.tool_category_sequence) AS category
    GROUP BY 1, 2
    HAVING COUNT(DISTINCT r.contributor_id) >= ${K}`
  await write('receipt_tool_categories', rollingCategories.map(r => ({
    period: String(r.period),
    dims: { category: r.category },
    value: {
      events: r.events,
      sessions: r.sessions,
      completion_rate: r.completion_rate,
      check_pass_rate: r.check_pass_rate,
    },
    contributors: Number(r.contributors),
  })))

  const rollingIntents = await sql`
    WITH periods(period, start_ms, end_ms) AS (VALUES
      ('rolling:24h:current', ${h24Current.startMs}::bigint, ${h24Current.endMs}::bigint),
      ('rolling:24h:previous', ${h24Previous.startMs}::bigint, ${h24Previous.endMs}::bigint),
      ('rolling:7d:current', ${d7Current.startMs}::bigint, ${d7Current.endMs}::bigint),
      ('rolling:7d:previous', ${d7Previous.startMs}::bigint, ${d7Previous.endMs}::bigint),
      ('rolling:30d:current', ${d30Current.startMs}::bigint, ${d30Current.endMs}::bigint),
      ('rolling:30d:previous', ${d30Previous.startMs}::bigint, ${d30Previous.endMs}::bigint)
    )
    SELECT p.period, r.intent,
           COUNT(*)::int AS sessions,
           ROUND(AVG(CASE WHEN r.terminal_state = 'completed' THEN 1.0 ELSE 0.0 END), 3)::float AS completion_rate,
           ROUND(AVG(CASE WHEN r.check_result = 'passed' THEN 1.0 ELSE 0.0 END), 3)::float AS check_pass_rate,
           COUNT(DISTINCT r.contributor_id)::int AS contributors
    FROM periods p
    JOIN network_receipts r ON r.observed_at >= p.start_ms AND r.observed_at < p.end_ms
    GROUP BY 1, 2
    HAVING COUNT(DISTINCT r.contributor_id) >= ${K}`
  await write('receipt_intents', rollingIntents.map(r => ({
    period: String(r.period),
    dims: { intent: r.intent },
    value: {
      sessions: r.sessions,
      completion_rate: r.completion_rate,
      check_pass_rate: r.check_pass_rate,
    },
    contributors: Number(r.contributors),
  })))

  const rollingWorkflows = await sql`
    WITH periods(period, start_ms, end_ms) AS (VALUES
      ('rolling:24h:current', ${h24Current.startMs}::bigint, ${h24Current.endMs}::bigint),
      ('rolling:24h:previous', ${h24Previous.startMs}::bigint, ${h24Previous.endMs}::bigint),
      ('rolling:7d:current', ${d7Current.startMs}::bigint, ${d7Current.endMs}::bigint),
      ('rolling:7d:previous', ${d7Previous.startMs}::bigint, ${d7Previous.endMs}::bigint),
      ('rolling:30d:current', ${d30Current.startMs}::bigint, ${d30Current.endMs}::bigint),
      ('rolling:30d:previous', ${d30Previous.startMs}::bigint, ${d30Previous.endMs}::bigint)
    )
    SELECT p.period, array_to_string(r.tool_category_sequence, '>') AS sequence,
           COUNT(*)::int AS sessions,
           ROUND(AVG(CASE WHEN r.terminal_state = 'completed' THEN 1.0 ELSE 0.0 END), 3)::float AS completion_rate,
           ROUND(AVG(CASE WHEN r.check_result = 'passed' THEN 1.0 ELSE 0.0 END), 3)::float AS check_pass_rate,
           COUNT(DISTINCT r.contributor_id)::int AS contributors
    FROM periods p
    JOIN network_receipts r ON r.observed_at >= p.start_ms AND r.observed_at < p.end_ms
    GROUP BY 1, 2
    HAVING COUNT(DISTINCT r.contributor_id) >= ${K}`
  await write('receipt_workflows', rollingWorkflows.map(r => ({
    period: String(r.period),
    dims: { sequence: r.sequence },
    value: {
      sessions: r.sessions,
      completion_rate: r.completion_rate,
      check_pass_rate: r.check_pass_rate,
    },
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
