-- 004_capture_upgrade.sql
-- v5 capture upgrades: Claude Code v2.1.211 fields + Codex adapter token totals.
-- Additive only. Matches packages/cli/src/migrate.ts local ALTERs.
-- NOT YET RUN against Neon — run manually after deploying the CLI that writes
-- these columns (sync.ts includes them in its INSERT/UPDATE statements).

-- tool_events: per-call identity, subagent attribution, effort level
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS tool_use_id TEXT;
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS agent_id TEXT;
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS agent_type TEXT;
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS effort_level TEXT;

-- sessions: transcript pointer + Stop-reported tool count
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS transcript_path TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS stop_tool_use_count INTEGER;

-- sessions: Codex backfill token totals (event_msg/token_count accumulation)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS input_tokens BIGINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS output_tokens BIGINT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cached_input_tokens BIGINT;
