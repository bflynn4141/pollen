-- 007_contributor_invites.sql — single-use, revocable onboarding invites.
-- Raw invite codes are returned once to the operator and never stored.

CREATE TABLE IF NOT EXISTS contributor_invites (
  invite_id       UUID PRIMARY KEY,
  code_hash       TEXT UNIQUE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  contributor_id TEXT REFERENCES contributors(contributor_id) ON DELETE SET NULL,
  CONSTRAINT contributor_invites_terminal_state CHECK (
    NOT (used_at IS NOT NULL AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_contributor_invites_active
  ON contributor_invites(expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;
