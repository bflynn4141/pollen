/**
 * Epoch module — token emission schedule.
 */

/**
 * Token emission per epoch (in wei, 18 decimals).
 *
 * Starts at 100,000 POLLEN per epoch, halves every 13 epochs (~quarterly).
 * This gives a total supply approaching 2.6M POLLEN. Mirrors
 * PollenTokenV2.epochPool: 100_000e18 >> ((epoch - 1) / 13).
 */
export function epochPool(epochNumber: number): bigint {
  const halvings = Math.floor((epochNumber - 1) / 13)
  const base = 100_000n * 10n ** 18n // 100k POLLEN
  return base >> BigInt(halvings) // right-shift = halve
}
