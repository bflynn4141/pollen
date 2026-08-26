-- 013_active_revenue.sql
-- Future active-holder revenue plans and public Merkle claim material.
-- This schema does not change or migrate PollenTokenV2 revenue accounting.

CREATE TABLE IF NOT EXISTS active_revenue_distributions (
  epoch                       INT PRIMARY KEY CHECK (epoch >= 1),
  schema_version              TEXT NOT NULL CHECK (schema_version = 'pollen-active-revenue-v1'),
  formula_version             TEXT NOT NULL CHECK (formula_version = 'active-holder-v1'),
  pollen_token_address        TEXT NOT NULL CHECK (pollen_token_address ~* '^0x[0-9a-f]{40}$'),
  snapshot_block              NUMERIC(78, 0) NOT NULL CHECK (snapshot_block > 0),
  snapshot_timestamp          TIMESTAMPTZ NOT NULL,
  pool_atomic_usdc            NUMERIC(78, 0) NOT NULL CHECK (pool_atomic_usdc >= 0),
  cap_atomic_usdc             NUMERIC(78, 0) NOT NULL CHECK (cap_atomic_usdc >= 0),
  allocated_atomic_usdc       NUMERIC(78, 0) NOT NULL CHECK (allocated_atomic_usdc >= 0),
  carry_atomic_usdc           NUMERIC(78, 0) NOT NULL CHECK (carry_atomic_usdc >= 0),
  eligible_wallets            INT NOT NULL CHECK (eligible_wallets >= 0),
  rejected_contributors       INT NOT NULL CHECK (rejected_contributors >= 0),
  source_digest               TEXT NOT NULL CHECK (source_digest ~* '^0x[0-9a-f]{64}$'),
  merkle_root                 TEXT NOT NULL CHECK (merkle_root ~* '^0x[0-9a-f]{64}$'),
  vault_address               TEXT CHECK (vault_address IS NULL OR vault_address ~* '^0x[0-9a-f]{40}$'),
  claim_deadline              TIMESTAMPTZ,
  publish_tx_hash             TEXT CHECK (publish_tx_hash IS NULL OR publish_tx_hash ~* '^0x[0-9a-f]{64}$'),
  status                      TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'published', 'expired')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (pool_atomic_usdc = allocated_atomic_usdc + carry_atomic_usdc),
  CHECK (
    status = 'draft'
    OR (allocated_atomic_usdc > 0 AND merkle_root <> ('0x' || repeat('0', 64)))
  ),
  CHECK (
    status = 'draft'
    OR (vault_address IS NOT NULL AND claim_deadline IS NOT NULL AND publish_tx_hash IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS active_revenue_allocations (
  epoch               INT NOT NULL REFERENCES active_revenue_distributions(epoch),
  claim_index         INT NOT NULL CHECK (claim_index >= 0),
  wallet_address      TEXT NOT NULL CHECK (wallet_address ~* '^0x[0-9a-f]{40}$'),
  amount_atomic_usdc  NUMERIC(78, 0) NOT NULL CHECK (amount_atomic_usdc > 0),
  proof               JSONB NOT NULL CHECK (jsonb_typeof(proof) = 'array'),
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'published', 'claimed', 'expired')),
  claim_tx_hash       TEXT CHECK (claim_tx_hash IS NULL OR claim_tx_hash ~* '^0x[0-9a-f]{64}$'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (epoch, claim_index)
);

CREATE UNIQUE INDEX IF NOT EXISTS active_revenue_one_claim_per_wallet_epoch
  ON active_revenue_allocations (epoch, lower(wallet_address));
