/**
 * Epoch calendar helpers.
 *
 * Mirrors PollenTokenV2.sol: EPOCH_ZERO = 1771891200 (2026-02-24 00:00 UTC,
 * a TUESDAY), 7-day epochs, 1-based. Epochs close Tuesdays 00:00 UTC; the
 * payout agent mints for the just-closed epoch shortly after.
 *
 * Scores and payouts live in Neon (`epoch_scores`, `payouts` — see
 * packages/site/migrations/003_contributors.sql) and are read by earnings.ts.
 */

// Epoch 1 starts on 2026-02-24 (Tuesday UTC) — matches the contract's EPOCH_ZERO
const EPOCH_ORIGIN = Date.UTC(2026, 1, 24) // Feb 24, 2026
const EPOCH_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 1 week

/**
 * Get the current epoch number (1-indexed, weekly).
 */
export function currentEpoch(): number {
  const now = Date.now()
  return Math.floor((now - EPOCH_ORIGIN) / EPOCH_DURATION_MS) + 1
}

/**
 * Get start/end timestamps for an epoch.
 */
export function epochBounds(epoch: number): { starts_at: number; ends_at: number } {
  const starts_at = EPOCH_ORIGIN + (epoch - 1) * EPOCH_DURATION_MS
  const ends_at = starts_at + EPOCH_DURATION_MS
  return { starts_at, ends_at }
}

/**
 * When the currently open epoch closes (= the next payout trigger).
 * Epochs close Tuesdays 00:00 UTC; the payout lands shortly after.
 */
export function nextEpochClose(): Date {
  return new Date(epochBounds(currentEpoch()).ends_at)
}
