-- 002_backfill.sql — repair historical rows before the first rollup run
--
-- 1) mcp_server repair: older CLI versions mislabeled underscore-named MCP
--    servers (extractMcpServer split on single underscores). For mcp__ rows
--    where the server was dropped entirely, recover it from the tool name:
--    mcp__<server>__<tool> → <server>. split_part on the '__' separator keeps
--    servers that themselves contain single underscores (e.g. ccd_session)
--    intact.
UPDATE tool_events
SET mcp_server = split_part(tool_name, '__', 2)
WHERE tool_name LIKE 'mcp\_\_%' ESCAPE '\'
  AND mcp_server IS NULL
  AND split_part(tool_name, '__', 2) <> '';

-- Repair rows where the old extractor kept only the first single-underscore
-- token of the server name (mcp__ccd_session__x → 'ccd'). The correct value
-- is always the full second '__' segment.
UPDATE tool_events
SET mcp_server = split_part(tool_name, '__', 2)
WHERE tool_name LIKE 'mcp\_\_%' ESCAPE '\'
  AND mcp_server IS DISTINCT FROM split_part(tool_name, '__', 2)
  AND split_part(tool_name, '__', 2) <> '';

-- 2) contributor_id backfill: early tool_events rows synced before
--    contributor stamping. Recover from the owning session where possible.
UPDATE tool_events te
SET contributor_id = s.contributor_id
FROM sessions s
WHERE te.contributor_id IS NULL
  AND te.session_id = s.session_id
  AND s.contributor_id IS NOT NULL;

-- Residual NULL-contributor rows are EXCLUDED from every rollup query
-- (WHERE contributor_id IS NOT NULL) — they can never contribute to a public
-- cell because they cannot be counted toward the K=5 threshold.
