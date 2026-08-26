import { describe, expect, it, vi } from 'vitest'
import { buildActiveRevenueArtifact, type ActiveRevenueArtifact } from './active-revenue-artifact.js'
import { saveActiveRevenueDraft, type ActiveRevenueDraftStore } from './active-revenue-draft-store.js'
import { epochBounds } from './epoch.js'

const EPOCH = 30

function artifact(): ActiveRevenueArtifact {
  return buildActiveRevenueArtifact({
    distributionEpoch: EPOCH,
    currentEpoch: EPOCH + 1,
    poolAtomicUsdc: BigInt(1_000),
    snapshot: {
      tokenAddress: '0x8ED2E55875Bf4C3082364441FfD314Ec6E228318',
      blockNumber: BigInt(36_000_000),
      blockTimestamp: Math.floor(epochBounds(EPOCH).endsAt / 1000),
    },
    candidates: Array.from({ length: 11 }, (_, index) => ({
      contributorId: `contributor-${index + 1}`,
      worldIdNullifier: `world-${index + 1}`,
      walletAddress: `0x${(index + 1).toString(16).padStart(40, '0')}`,
      walletBindingValid: true,
      snapshotBalanceWei: BigInt('1000000000000000000'),
      scores: [{ epoch: EPOCH, score: '1' }],
    })),
  })
}

describe('active revenue draft persistence', () => {
  it('validates all accounting and proofs before one atomic store call', async () => {
    const store: ActiveRevenueDraftStore = { replaceDraft: vi.fn(async () => {}) }
    const value = artifact()

    await saveActiveRevenueDraft(store, value)
    expect(store.replaceDraft).toHaveBeenCalledOnce()
    expect(store.replaceDraft).toHaveBeenCalledWith(value)
  })

  it('rejects a tampered allocation before storage', async () => {
    const store: ActiveRevenueDraftStore = { replaceDraft: vi.fn(async () => {}) }
    const value = artifact()
    value.claims[0].amountAtomicUsdc = String(BigInt(value.claims[0].amountAtomicUsdc) + BigInt(1))

    await expect(saveActiveRevenueDraft(store, value)).rejects.toThrow(/invalid Merkle proof|accounting mismatch/i)
    expect(store.replaceDraft).not.toHaveBeenCalled()
  })
})
