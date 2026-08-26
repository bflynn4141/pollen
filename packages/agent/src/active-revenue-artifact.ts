import { getAddress, keccak256, toHex, type Address, type Hex } from 'viem'
import {
  computeActiveHolderAllocations,
  type ActiveHolderAllocationInput,
} from './active-holder.js'
import { buildActiveRevenueMerkleTree } from './active-revenue-merkle.js'

export interface ActiveRevenueClaimArtifact {
  index: number
  walletAddress: Address
  amountAtomicUsdc: string
  proof: Hex[]
}

export interface ActiveRevenueArtifact {
  schemaVersion: 'pollen-active-revenue-v1'
  formulaVersion: 'active-holder-v1'
  epoch: number
  tokenAddress: Address
  snapshotBlock: string
  snapshotTimestamp: number
  poolAtomicUsdc: string
  capAtomicUsdc: string
  totalAllocatedAtomicUsdc: string
  carryAtomicUsdc: string
  eligibleWallets: number
  rejectedContributors: number
  sourceDigest: Hex
  merkleRoot: Hex
  claims: ActiveRevenueClaimArtifact[]
}

function digestPrivateSource(input: ActiveHolderAllocationInput): Hex {
  const canonical = {
    distributionEpoch: input.distributionEpoch,
    currentEpoch: input.currentEpoch,
    poolAtomicUsdc: input.poolAtomicUsdc.toString(),
    snapshot: {
      tokenAddress: getAddress(input.snapshot.tokenAddress),
      blockNumber: input.snapshot.blockNumber.toString(),
      blockTimestamp: input.snapshot.blockTimestamp,
    },
    candidates: input.candidates
      .map(row => ({
        contributorId: row.contributorId,
        worldIdNullifier: row.worldIdNullifier,
        walletAddress: row.walletAddress ? getAddress(row.walletAddress) : null,
        walletBindingValid: row.walletBindingValid,
        snapshotBalanceWei: row.snapshotBalanceWei.toString(),
        scores: [...row.scores]
          .sort((a, b) => a.epoch - b.epoch)
          .map(score => ({ epoch: score.epoch, score: score.score })),
      }))
      .sort((a, b) => (a.walletAddress ?? '').toLowerCase()
        .localeCompare((b.walletAddress ?? '').toLowerCase())),
  }
  return keccak256(toHex(JSON.stringify(canonical)))
}

/**
 * Produce the public, deterministic claim artifact. Contributor IDs, World ID
 * nullifiers, wallet-binding signatures, and raw epoch rows remain private;
 * sourceDigest lets operators bind a protected audit record to this artifact.
 */
export function buildActiveRevenueArtifact(
  input: ActiveHolderAllocationInput,
): ActiveRevenueArtifact {
  const result = computeActiveHolderAllocations(input)
  const tree = buildActiveRevenueMerkleTree(result.distributionEpoch, result.allocations.map(row => ({
    contributorId: row.contributorId,
    walletAddress: row.walletAddress,
    amountAtomicUsdc: row.amountAtomicUsdc,
  })))

  return {
    schemaVersion: 'pollen-active-revenue-v1',
    formulaVersion: result.formulaVersion,
    epoch: result.distributionEpoch,
    tokenAddress: result.snapshot.tokenAddress,
    snapshotBlock: result.snapshot.blockNumber.toString(),
    snapshotTimestamp: result.snapshot.blockTimestamp,
    poolAtomicUsdc: result.poolAtomicUsdc.toString(),
    capAtomicUsdc: result.capAtomicUsdc.toString(),
    totalAllocatedAtomicUsdc: result.totalAllocatedAtomicUsdc.toString(),
    carryAtomicUsdc: result.carryAtomicUsdc.toString(),
    eligibleWallets: result.eligible.length,
    rejectedContributors: result.rejected.length,
    sourceDigest: digestPrivateSource(input),
    merkleRoot: tree.root,
    claims: tree.leaves.map(leaf => ({
      index: leaf.index,
      walletAddress: leaf.walletAddress,
      amountAtomicUsdc: leaf.amountAtomicUsdc.toString(),
      proof: leaf.proof,
    })),
  }
}

export function stringifyActiveRevenueArtifact(artifact: ActiveRevenueArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`
}
