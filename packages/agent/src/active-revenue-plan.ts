import { neon } from '@neondatabase/serverless'
import { isAddress, type Hex } from 'viem'
import { buildActiveRevenueArtifact, type ActiveRevenueArtifact } from './active-revenue-artifact.js'
import type { ActiveHolderCandidate, EpochScore } from './active-holder.js'
import { hasValidWalletBinding } from './db.js'
import { currentEpoch } from './epoch.js'
import { readPollenSnapshot, type PollenSnapshotClient } from './pollen-snapshot.js'

export interface ActiveRevenueSourceStore {
  fetchCandidates(distributionEpoch: number): Promise<ActiveHolderCandidate[]>
}

export function createActiveRevenueSourceStore(connectionString: string): ActiveRevenueSourceStore {
  const sql = neon(connectionString)
  return {
    async fetchCandidates(distributionEpoch: number): Promise<ActiveHolderCandidate[]> {
      const firstEpoch = Math.max(1, distributionEpoch - 3)
      const rows = await sql`
        SELECT c.contributor_id, c.world_id_nullifier, c.verified_at, c.wallet_address,
               c.wallet_binding_sig,
               json_agg(
                 json_build_object('epoch', es.epoch, 'score', es.score::text)
                 ORDER BY es.epoch
               ) AS scores
        FROM epoch_scores es
        JOIN contributors c ON c.contributor_id = es.contributor_id
        WHERE es.epoch BETWEEN ${firstEpoch} AND ${distributionEpoch}
        GROUP BY c.contributor_id, c.world_id_nullifier, c.verified_at, c.wallet_address,
                 c.wallet_binding_sig
        ORDER BY c.contributor_id
      `

      return Promise.all(rows.map(async row => {
        const contributorId = String(row.contributor_id)
        const walletAddress = row.wallet_address ? String(row.wallet_address) : null
        const signature = row.wallet_binding_sig ? String(row.wallet_binding_sig) as Hex : null
        const walletBindingValid = walletAddress !== null
          && isAddress(walletAddress)
          && signature !== null
          && await hasValidWalletBinding(contributorId, walletAddress, signature)
        return {
          contributorId,
          worldIdNullifier: row.world_id_nullifier && row.verified_at
            ? String(row.world_id_nullifier)
            : null,
          walletAddress,
          walletBindingValid,
          snapshotBalanceWei: BigInt(0),
          scores: (row.scores as Array<{ epoch: number; score: string }>).map(score => ({
            epoch: Number(score.epoch),
            score: String(score.score),
          })) satisfies EpochScore[],
        }
      }))
    },
  }
}

export interface PrepareActiveRevenuePlanDependencies {
  sourceStore: ActiveRevenueSourceStore
  snapshotClient: PollenSnapshotClient
}

export interface PrepareActiveRevenuePlanOptions {
  distributionEpoch: number
  poolAtomicUsdc: bigint
  tokenAddress: string
  snapshotBlock: bigint
  nowMs?: number
}

/**
 * Read protected score/identity inputs plus archive-RPC balances and produce a
 * public artifact. This function has no database writes and no transaction or
 * root-publication capability.
 */
export async function prepareActiveRevenuePlan(
  deps: PrepareActiveRevenuePlanDependencies,
  options: PrepareActiveRevenuePlanOptions,
): Promise<ActiveRevenueArtifact> {
  const candidates = await deps.sourceStore.fetchCandidates(options.distributionEpoch)
  const snapshot = await readPollenSnapshot(deps.snapshotClient, {
    distributionEpoch: options.distributionEpoch,
    tokenAddress: options.tokenAddress,
    blockNumber: options.snapshotBlock,
    walletAddresses: candidates.flatMap(candidate =>
      candidate.walletAddress && isAddress(candidate.walletAddress) ? [candidate.walletAddress] : [],
    ),
  })
  const balanceByWallet = new Map(snapshot.balances.map(row => [
    row.walletAddress.toLowerCase(),
    row.balanceWei,
  ]))
  const candidatesWithBalances = candidates.map(candidate => ({
    ...candidate,
    snapshotBalanceWei: candidate.walletAddress
      ? balanceByWallet.get(candidate.walletAddress.toLowerCase()) ?? BigInt(0)
      : BigInt(0),
  }))

  return buildActiveRevenueArtifact({
    distributionEpoch: options.distributionEpoch,
    currentEpoch: currentEpoch(options.nowMs),
    poolAtomicUsdc: options.poolAtomicUsdc,
    snapshot: {
      tokenAddress: snapshot.tokenAddress,
      blockNumber: snapshot.blockNumber,
      blockTimestamp: snapshot.blockTimestamp,
    },
    candidates: candidatesWithBalances,
  })
}
