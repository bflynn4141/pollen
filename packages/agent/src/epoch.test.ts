import { describe, it, expect } from 'vitest'
import { EPOCH_ZERO_MS, EPOCH_LENGTH_MS, currentEpoch, epochPool, epochBounds } from './epoch.js'

describe('epoch constants', () => {
  it('EPOCH_ZERO matches the contract (1771891200) and credits.ts (Date.UTC(2026, 1, 24))', () => {
    expect(EPOCH_ZERO_MS).toBe(1_771_891_200_000)
    expect(EPOCH_ZERO_MS).toBe(Date.UTC(2026, 1, 24)) // packages/cli/src/credits.ts EPOCH_ORIGIN
  })

  it('epochs close on Tuesdays 00:00 UTC', () => {
    expect(new Date(EPOCH_ZERO_MS).getUTCDay()).toBe(2) // Tuesday
    const { endsAt } = epochBounds(5)
    expect(new Date(endsAt).getUTCDay()).toBe(2)
    expect(endsAt % (24 * 60 * 60 * 1000)).toBe(0) // midnight UTC
  })
})

describe('currentEpoch', () => {
  it('is 1-based starting at EPOCH_ZERO', () => {
    expect(currentEpoch(EPOCH_ZERO_MS)).toBe(1)
    expect(currentEpoch(EPOCH_ZERO_MS + EPOCH_LENGTH_MS - 1)).toBe(1)
    expect(currentEpoch(EPOCH_ZERO_MS + EPOCH_LENGTH_MS)).toBe(2)
    expect(currentEpoch(EPOCH_ZERO_MS + 23 * EPOCH_LENGTH_MS + 1)).toBe(24)
  })

  it('throws before epoch zero, like the contract', () => {
    expect(() => currentEpoch(EPOCH_ZERO_MS - 1)).toThrow(/before epoch zero/)
  })
})

describe('epochPool', () => {
  it('matches the contract formula 100_000e18 >> ((n-1)/13)', () => {
    const base = 100_000n * 10n ** 18n
    expect(epochPool(1)).toBe(base)
    expect(epochPool(13)).toBe(base) // last epoch before the first halving
    expect(epochPool(14)).toBe(base >> 1n)
    expect(epochPool(26)).toBe(base >> 1n)
    expect(epochPool(27)).toBe(base >> 2n)
    expect(epochPool(1 + 13 * 10)).toBe(base >> 10n)
  })

  it('rejects epoch < 1, like the contract', () => {
    expect(() => epochPool(0)).toThrow(/1-based/)
    expect(() => epochPool(-3)).toThrow(/1-based/)
    expect(() => epochPool(1.5)).toThrow(/1-based/)
  })
})
