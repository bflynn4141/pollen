-- 003_contributors.sql
-- Identity + scoring + payout tables (Phase B).
--
-- contributors: one row per CLI install (contributor_id from ~/.pollen/config.json).
--   - wallet_address binding is first-write-wins (enforced in application upserts).
--   - world_id_nullifier UNIQUE = one human (World ID) can back at most one contributor.
-- epoch_scores: output of the weekly epoch-close cron (scoring v1).
-- payouts: written by the AgentKit payout agent after mintBatch.

CREATE TABLE IF NOT EXISTS contributors (
  contributor_id     TEXT PRIMARY KEY,
  wallet_address     TEXT,
  wallet_binding_sig TEXT,             -- EIP-191 signature of 'pollen:register:<contributor_id>' (BYO wallets only)
  world_id_nullifier TEXT UNIQUE,      -- sybil resistance: one World ID -> one contributor
  verification_level TEXT,             -- 'device' | 'orb'
  verified_at        TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS epoch_scores (
  epoch          INT NOT NULL,
  contributor_id TEXT NOT NULL,
  score          NUMERIC NOT NULL,
  breakdown      JSONB,                -- per-component transparency ('pollen earnings' renders it)
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (epoch, contributor_id)
);

CREATE TABLE IF NOT EXISTS payouts (
  epoch          INT NOT NULL,
  contributor_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  amount         NUMERIC NOT NULL,     -- POLLEN, 18-decimal token units expressed as whole tokens
  tx_hash        TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'confirmed' | 'failed'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (epoch, contributor_id)
);
