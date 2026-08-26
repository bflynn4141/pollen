import { describe, expect, it, vi } from 'vitest'
import { EPOCH_LENGTH_MS, EPOCH_ZERO_MS, epochBounds } from './epoch.js'
import {
  prepareActiveRevenuePlan,
  type ActiveRevenueSourceStore,
} from './active-revenue-plan.js'
import type { PollenSnapshotClient } from './pollen-snapshot.js'

const EPOCH = 30
const TOKEN = '0x8ED2E55875Bf4C3082364441FfD314Ec6E228318'
const BLOCK = 36_000_000n

describe('active revenue plan preparation', () => {
  it('joins protected source rows to exact historical balances without writing or publishing', async () => {
    const candidates = Array.from({ length: 11 }, (_, index) => ({
      contributorId: `contributor-${index + 1}`,
      worldIdNullifier: `world-${index + 1}`,
      walletAddress: `0x${(index + 1).toString(16).padStart(40, '0')}`,
      walletBindingValid: true,
      snapshotBalanceWei: BigInt(0),
      scores: [{ epoch: EPOCH, score: '1' }],
    }))
    const sourceStore: ActiveRevenueSourceStore = {
      fetchCandidates: vi.fn(async () => candidates),
    }
    const snapshotClient: PollenSnapshotClient = {
      getBlock: vi.fn(async ({ blockNumber }) => ({
        timestamp: BigInt(Math.floor(epochBounds(EPOCH).endsAt / 1000))
          + (blockNumber === BLOCK ? BigInt(0) : BigInt(1)),
      })),
      readContract: vi.fn(async () => BigInt('1000000000000000000')),
    }

    const artifact = await prepareActiveRevenuePlan({ sourceStore, snapshotClient }, {
      distributionEpoch: EPOCH,
      poolAtomicUsdc: BigInt(1_000),
      tokenAddress: TOKEN,
      snapshotBlock: BLOCK,
      nowMs: EPOCH_ZERO_MS + EPOCH * EPOCH_LENGTH_MS + 1,
    })

    expect(sourceStore.fetchCandidates).toHaveBeenCalledWith(EPOCH)
    expect(snapshotClient.readContract).toHaveBeenCalledTimes(11)
    expect(artifact.claims).toHaveLength(11)
    expect(artifact.totalAllocatedAtomicUsdc).toBe('1000')
  })

  it('does not request a balance for a contributor with no bound wallet', async () => {
    const sourceStore: ActiveRevenueSourceStore = {
      fetchCandidates: vi.fn(async () => [{
        contributorId: 'missing-wallet',
        worldIdNullifier: 'world-1',
        walletAddress: null,
        walletBindingValid: false,
        snapshotBalanceWei: BigInt(0),
        scores: [{ epoch: EPOCH, score: '1' }],
      }]),
    }
    const snapshotClient: PollenSnapshotClient = {
      getBlock: vi.fn(async ({ blockNumber }) => ({
        timestamp: BigInt(Math.floor(epochBounds(EPOCH).endsAt / 1000))
          + (blockNumber === BLOCK ? BigInt(0) : BigInt(1)),
      })),
      readContract: vi.fn(async () => BigInt(0)),
    }

    const artifact = await prepareActiveRevenuePlan({ sourceStore, snapshotClient }, {
      distributionEpoch: EPOCH,
      poolAtomicUsdc: BigInt(100),
      tokenAddress: TOKEN,
      snapshotBlock: BLOCK,
      nowMs: EPOCH_ZERO_MS + EPOCH * EPOCH_LENGTH_MS + 1,
    })

    expect(snapshotClient.readContract).not.toHaveBeenCalled()
    expect(artifact.claims).toEqual([])
    expect(artifact.carryAtomicUsdc).toBe('100')
  })
})
