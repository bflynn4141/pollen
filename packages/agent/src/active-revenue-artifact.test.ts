import { describe, expect, it } from 'vitest'
import { epochBounds } from './epoch.js'
import {
  buildActiveRevenueArtifact,
  stringifyActiveRevenueArtifact,
} from './active-revenue-artifact.js'
import { verifyActiveRevenueProof } from './active-revenue-merkle.js'
import type { ActiveHolderCandidate } from './active-holder.js'

const EPOCH = 30
const TOKEN = '0x8ED2E55875Bf4C3082364441FfD314Ec6E228318'

function candidate(index: number): ActiveHolderCandidate {
  return {
    contributorId: `contributor-${index}`,
    worldIdNullifier: `world-${index}`,
    walletAddress: `0x${index.toString(16).padStart(40, '0')}`,
    walletBindingValid: true,
    snapshotBalanceWei: BigInt(index) * 10n ** 18n,
    scores: [{ epoch: EPOCH, score: String(index) }],
  }
}

function input(candidates: ActiveHolderCandidate[]) {
  return {
    distributionEpoch: EPOCH,
    currentEpoch: EPOCH + 1,
    poolAtomicUsdc: 1_000_003n,
    snapshot: {
      tokenAddress: TOKEN,
      blockNumber: 36_000_000n,
      blockTimestamp: Math.floor(epochBounds(EPOCH).endsAt / 1000),
    },
    candidates,
  }
}

describe('active revenue artifact', () => {
  it('is deterministic across source ordering and contains no private identity fields', () => {
    const rows = Array.from({ length: 12 }, (_, index) => candidate(index + 1))
    const forward = buildActiveRevenueArtifact(input(rows))
    const reverse = buildActiveRevenueArtifact(input([...rows].reverse()))

    expect(stringifyActiveRevenueArtifact(forward)).toBe(stringifyActiveRevenueArtifact(reverse))
    expect(forward.sourceDigest).toBe(reverse.sourceDigest)
    expect(stringifyActiveRevenueArtifact(forward)).not.toContain('world-')
    expect(stringifyActiveRevenueArtifact(forward)).not.toContain('contributor-')
  })

  it('serializes exact integer accounting and valid claim proofs', () => {
    const artifact = buildActiveRevenueArtifact(input(
      Array.from({ length: 12 }, (_, index) => candidate(index + 1)),
    ))
    const sum = artifact.claims.reduce((total, claim) => total + BigInt(claim.amountAtomicUsdc), 0n)

    expect(sum).toBe(BigInt(artifact.totalAllocatedAtomicUsdc))
    expect(sum + BigInt(artifact.carryAtomicUsdc)).toBe(BigInt(artifact.poolAtomicUsdc))
    for (const claim of artifact.claims) {
      expect(verifyActiveRevenueProof(artifact.merkleRoot, {
        epoch: artifact.epoch,
        index: claim.index,
        walletAddress: claim.walletAddress,
        amountAtomicUsdc: BigInt(claim.amountAtomicUsdc),
      }, claim.proof)).toBe(true)
    }
    expect(() => JSON.parse(stringifyActiveRevenueArtifact(artifact))).not.toThrow()
  })

  it('records a zero root and full carry when nobody is eligible', () => {
    const artifact = buildActiveRevenueArtifact(input([]))
    expect(artifact.claims).toEqual([])
    expect(artifact.merkleRoot).toBe(`0x${'0'.repeat(64)}`)
    expect(artifact.totalAllocatedAtomicUsdc).toBe('0')
    expect(artifact.carryAtomicUsdc).toBe(artifact.poolAtomicUsdc)
  })
})
