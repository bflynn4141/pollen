import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { epochBounds } from './epoch.js'
import {
  computeActiveHolderAllocations,
  computeDecayedActivity,
  integerSqrt,
  type ActiveHolderCandidate,
} from './active-holder.js'

const TOKEN = '0x8ED2E55875Bf4C3082364441FfD314Ec6E228318'
const EPOCH = 30

function wallet(index: number): `0x${string}` {
  return `0x${index.toString(16).padStart(40, '0')}`
}

function candidate(
  index: number,
  overrides: Partial<ActiveHolderCandidate> = {},
): ActiveHolderCandidate {
  return {
    contributorId: `contributor-${index}`,
    worldIdNullifier: `world-${index}`,
    walletAddress: wallet(index),
    walletBindingValid: true,
    snapshotBalanceWei: 100n * 10n ** 18n,
    scores: [{ epoch: EPOCH, score: '10' }],
    ...overrides,
  }
}

function input(candidates: ActiveHolderCandidate[], poolAtomicUsdc = 1_000n) {
  return {
    distributionEpoch: EPOCH,
    currentEpoch: EPOCH + 1,
    poolAtomicUsdc,
    snapshot: {
      tokenAddress: TOKEN,
      blockNumber: 36_000_000n,
      blockTimestamp: Math.floor(epochBounds(EPOCH).endsAt / 1000),
    },
    candidates,
  }
}

describe('active-holder recency and balance weighting', () => {
  it('uses the approved four closed-epoch weights and ignores older scores', () => {
    expect(computeDecayedActivity([
      { epoch: EPOCH, score: '1' },
      { epoch: EPOCH - 1, score: '1' },
      { epoch: EPOCH - 2, score: '1' },
      { epoch: EPOCH - 3, score: '1' },
      { epoch: EPOCH - 4, score: '999999' },
    ], EPOCH)).toBe(15_000_000n)

    expect(computeDecayedActivity([{ epoch: EPOCH - 3, score: '8' }], EPOCH))
      .toBe(8_000_000n)
    expect(computeDecayedActivity([{ epoch: EPOCH, score: '8' }], EPOCH))
      .toBe(64_000_000n)
  })

  it('uses integer square-root POLLEN balance weighting', () => {
    expect(integerSqrt(0n)).toBe(0n)
    expect(integerSqrt(25n)).toBe(5n)
    expect(integerSqrt(26n)).toBe(5n)

    const result = computeActiveHolderAllocations(input([
      candidate(1, { snapshotBalanceWei: 100n }),
      candidate(2, { snapshotBalanceWei: 25n }),
    ]))
    expect(result.eligible[0].rawWeight / result.eligible[1].rawWeight).toBe(2n)
  })
})

describe('active-holder eligibility and snapshots', () => {
  it('requires recent positive activity, identity, binding, and snapshot POLLEN', () => {
    const result = computeActiveHolderAllocations(input([
      candidate(1),
      candidate(2, { scores: [{ epoch: EPOCH - 4, score: '100' }] }),
      candidate(3, { worldIdNullifier: null }),
      candidate(4, { walletAddress: null }),
      candidate(5, { walletBindingValid: false }),
      candidate(6, { snapshotBalanceWei: 0n }),
      candidate(7, { scores: [{ epoch: EPOCH, score: '0' }] }),
    ]))

    expect(result.eligible.map(row => row.contributorId)).toEqual(['contributor-1'])
    expect(result.rejected.map(row => row.reason)).toEqual([
      'no_recent_positive_score',
      'identity_required',
      'wallet_required',
      'wallet_binding_invalid',
      'no_snapshot_pollen',
      'no_recent_positive_score',
    ])
  })

  it('rejects duplicate contributor IDs, identities, and normalized wallets', () => {
    expect(() => computeActiveHolderAllocations(input([
      candidate(1),
      candidate(2, { contributorId: 'contributor-1' }),
    ]))).toThrow(/duplicate contributor/i)
    expect(() => computeActiveHolderAllocations(input([
      candidate(1, { worldIdNullifier: '0xabcdef' }),
      candidate(2, { worldIdNullifier: '0xABCDEF' }),
    ]))).toThrow(/duplicate World ID/i)
    expect(() => computeActiveHolderAllocations(input([
      candidate(1),
      candidate(2, { walletAddress: wallet(1) }),
    ]))).toThrow(/duplicate wallet/i)
  })

  it('requires the just-closed epoch and a boundary snapshot at or before close', () => {
    expect(() => computeActiveHolderAllocations({
      ...input([candidate(1)]),
      currentEpoch: EPOCH + 2,
    })).toThrow(/just-closed epoch/i)

    expect(() => computeActiveHolderAllocations({
      ...input([candidate(1)]),
      snapshot: {
        ...input([]).snapshot,
        blockTimestamp: Math.floor(epochBounds(EPOCH).endsAt / 1000) + 1,
      },
    })).toThrow(/snapshot timestamp/i)
  })
})

describe('ten-percent cap, redistribution, and dust', () => {
  it('caps a dominant wallet and redistributes its excess', () => {
    const candidates = Array.from({ length: 11 }, (_, index) => candidate(index + 1, {
      scores: [{ epoch: EPOCH, score: index === 0 ? '1000000' : '1' }],
    }))
    const result = computeActiveHolderAllocations(input(candidates, 1_000n))
    const dominant = result.allocations.find(row => row.contributorId === 'contributor-1')!
    const others = result.allocations.filter(row => row.contributorId !== 'contributor-1')

    expect(result.capAtomicUsdc).toBe(100n)
    expect(dominant.amountAtomicUsdc).toBe(100n)
    expect(others.map(row => row.amountAtomicUsdc)).toEqual(Array(10).fill(90n))
    expect(result.totalAllocatedAtomicUsdc).toBe(1_000n)
    expect(result.carryAtomicUsdc).toBe(0n)
  })

  it('uses deterministic largest remainders and wallet ordering for atomic dust', () => {
    const result = computeActiveHolderAllocations(input(
      Array.from({ length: 11 }, (_, index) => candidate(index + 1)),
      1_000n,
    ))

    expect(result.allocations.map(row => row.walletAddress)).toEqual(
      Array.from({ length: 11 }, (_, index) => getAddress(wallet(index + 1))),
    )
    expect(result.allocations.map(row => row.amountAtomicUsdc)).toEqual([
      91n, 91n, 91n, 91n, 91n, 91n, 91n, 91n, 91n, 91n, 90n,
    ])
    expect(result.totalAllocatedAtomicUsdc).toBe(1_000n)
  })

  it('carries pool value that cannot be assigned without breaking the cap', () => {
    const result = computeActiveHolderAllocations(input(
      Array.from({ length: 10 }, (_, index) => candidate(index + 1)),
      1_001n,
    ))
    expect(result.capAtomicUsdc).toBe(100n)
    expect(result.totalAllocatedAtomicUsdc).toBe(1_000n)
    expect(result.carryAtomicUsdc).toBe(1n)
  })

  it('carries the full pool when no wallet is eligible', () => {
    const result = computeActiveHolderAllocations(input([], 50_000n))
    expect(result.allocations).toEqual([])
    expect(result.totalAllocatedAtomicUsdc).toBe(0n)
    expect(result.carryAtomicUsdc).toBe(50_000n)
  })
})
