-- Pollen v4: Data Capture Improvements
-- Run this BEFORE deploying new sync code to production
-- All statements are idempotent (IF NOT EXISTS / safe for re-runs)

-- contributor_id across all tables
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS contributor_id TEXT;
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS contributor_id TEXT;
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS contributor_id TEXT;

-- Tool response coarsening
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS response_type TEXT;
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS response_size INTEGER;
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS response_file_paths INTEGER;
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS response_has_code BOOLEAN;
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS response_has_error BOOLEAN;
ALTER TABLE tool_events ADD COLUMN IF NOT EXISTS response_summary TEXT;

-- Session aggregates
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS edit_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS read_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS search_to_edit_ratio REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS error_recovery_rate REAL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mcp_tool_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS unique_mcp_servers INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS permission_mode TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS subagent_count INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS context_compactions INTEGER DEFAULT 0;

-- Permission mode on contributions
ALTER TABLE contributions ADD COLUMN IF NOT EXISTS permission_mode TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_contributor ON sessions(contributor_id);
CREATE INDEX IF NOT EXISTS idx_contributions_contributor ON contributions(contributor_id);

-- Lifecycle events table (new)
CREATE TABLE IF NOT EXISTS lifecycle_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  parent_event_id TEXT,
  metadata JSONB,
  contributor_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_session ON lifecycle_events(session_id, event_type);

-- x402_events: add contributor_id (table may already exist)
ALTER TABLE x402_events ADD COLUMN IF NOT EXISTS contributor_id TEXT;

-- Sync meta watermarks for new tables
INSERT INTO sync_meta (key, value) VALUES ('last_sync_lifecycle_events', '0') ON CONFLICT (key) DO NOTHING;
INSERT INTO sync_meta (key, value) VALUES ('last_sync_x402_events', '0') ON CONFLICT (key) DO NOTHING;
