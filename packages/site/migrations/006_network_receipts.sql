-- 006_network_receipts.sql — authenticated, privacy-closed contribution ingest.
--
-- Public clients never receive a database credential. A founding-panel invite
-- creates a pseudonymous contributor plus a bearer token; only its SHA-256
-- hash is stored. The receipt table intentionally has no JSON/free-text field,
-- prompt, arguments, response excerpts, paths, commands, or user identifiers.

CREATE TABLE IF NOT EXISTS contributor_api_tokens (
  token_hash     TEXT PRIMARY KEY,
  contributor_id TEXT NOT NULL REFERENCES contributors(contributor_id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contributor_api_tokens_contributor
  ON contributor_api_tokens(contributor_id);

CREATE TABLE IF NOT EXISTS network_receipts (
  receipt_id              UUID NOT NULL,
  contributor_id          TEXT NOT NULL REFERENCES contributors(contributor_id) ON DELETE CASCADE,
  observed_at             BIGINT NOT NULL,
  intent                  TEXT NOT NULL,
  agent                   TEXT NOT NULL,
  model                   TEXT NOT NULL,
  tool_category_sequence  TEXT[] NOT NULL,
  duration_bucket         TEXT NOT NULL,
  terminal_state          TEXT NOT NULL,
  check_result            TEXT NOT NULL,
  received_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contributor_id, receipt_id),
  CONSTRAINT network_receipts_intent CHECK (
    intent IN ('debugging', 'feature_build', 'refactoring', 'learning', 'devops',
      'testing', 'documentation', 'code_review', 'exploration')
  ),
  CONSTRAINT network_receipts_agent CHECK (agent IN ('claude-code', 'codex')),
  CONSTRAINT network_receipts_duration CHECK (
    duration_bucket IN ('quick', 'short', 'medium', 'long', 'marathon')
  ),
  CONSTRAINT network_receipts_terminal CHECK (
    terminal_state IN ('completed', 'abandoned', 'error_exit')
  ),
  CONSTRAINT network_receipts_check CHECK (
    check_result IN ('passed', 'failed', 'not_run', 'unknown')
  ),
  CONSTRAINT network_receipts_tool_count CHECK (
    cardinality(tool_category_sequence) <= 64
  )
);

CREATE INDEX IF NOT EXISTS idx_network_receipts_observed_at
  ON network_receipts(observed_at);
CREATE INDEX IF NOT EXISTS idx_network_receipts_contributor
  ON network_receipts(contributor_id);
