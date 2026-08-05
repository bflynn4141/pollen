/**
 * Epoch math — mirrors PollenTokenV2.sol exactly.
 *
 * On-chain constants (contracts/src/PollenTokenV2.sol):
 *   EPOCH_ZERO   = 1771891200 (2026-02-24 00:00:00 UTC — a TUESDAY)
 *   EPOCH_LENGTH = 7 days
 *   currentEpoch() is 1-based; epoch N covers [EPOCH_ZERO + (N-1)*7d, EPOCH_ZERO + N*7d)
 *   epochPool(n) = 100_000e18 >> ((n-1)/13) — halves every 13 epochs (~quarterly)
 *
 * Also mirrors packages/cli/src/credits.ts (EPOCH_ORIGIN = Date.UTC(2026, 1, 24)).
 */

export const EPOCH_ZERO_SECONDS = 1_771_891_200
export const EPOCH_ZERO_MS = EPOCH_ZERO_SECONDS * 1000
export const EPOCH_LENGTH_MS = 7 * 24 * 60 * 60 * 1000

/** Current epoch number, 1-based (epoch 1 starts at EPOCH_ZERO). */
export function currentEpoch(nowMs: number = Date.now()): number {
  if (nowMs < EPOCH_ZERO_MS) {
    throw new Error('before epoch zero (2026-02-24 00:00 UTC)')
  }
  return Math.floor((nowMs - EPOCH_ZERO_MS) / EPOCH_LENGTH_MS) + 1
}

/** POLLEN (wei) mintable for `epoch`; halves every 13 epochs. */
export function epochPool(epoch: number): bigint {
  if (!Number.isInteger(epoch) || epoch < 1) {
    throw new Error('epoch is 1-based')
  }
  const halvings = Math.floor((epoch - 1) / 13)
  return (100_000n * 10n ** 18n) >> BigInt(halvings)
}

/** [start, end) window of an epoch in unix ms. */
export function epochBounds(epoch: number): { startsAt: number; endsAt: number } {
  const startsAt = EPOCH_ZERO_MS + (epoch - 1) * EPOCH_LENGTH_MS
  return { startsAt, endsAt: startsAt + EPOCH_LENGTH_MS }
}
