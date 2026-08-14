-- 008_unique_active_contributor_token.sql — one live credential per contributor.
-- Revoked tokens remain as an audit trail and do not prevent a later rejoin.

CREATE UNIQUE INDEX IF NOT EXISTS idx_contributor_api_tokens_one_active
  ON contributor_api_tokens(contributor_id)
  WHERE revoked_at IS NULL;
