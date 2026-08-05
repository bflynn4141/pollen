-- 001_rollups.sql — k-anonymized rollup layer (Phase A)
--
-- rollup_cells is the ONLY table the public /trending pages and the /api/v1
-- routes may read. Cells are written exclusively by computeRollups()
-- (src/lib/rollups.ts), which suppresses any cell with fewer than K=5
-- distinct contributors at write time (HAVING COUNT(DISTINCT contributor_id) >= 5).
--
-- Periods: ISO weeks as 'IYYY-"W"IW' (e.g. 2026-W32), days as YYYY-MM-DD.
-- Recompute runs over a rolling 8-week window; older cells are frozen so
-- /trending/<week> permalinks stay citable and history stays sellable.

CREATE TABLE IF NOT EXISTS rollup_cells (
  rollup TEXT NOT NULL,
  period TEXT NOT NULL,
  dims JSONB NOT NULL,
  value JSONB NOT NULL,
  contributors INT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rollup, period, dims)
);

CREATE INDEX IF NOT EXISTS idx_rollup_cells_rollup_period ON rollup_cells(rollup, period);

-- Raw-table indexes the rollup queries lean on.
-- tool_events.timestamp is unix-ms BIGINT.
CREATE INDEX IF NOT EXISTS idx_tool_events_contributor ON tool_events(contributor_id);
CREATE INDEX IF NOT EXISTS idx_tool_events_ts_tool ON tool_events(timestamp, tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_events_mcp_server
  ON tool_events(mcp_server) WHERE mcp_server IS NOT NULL;
