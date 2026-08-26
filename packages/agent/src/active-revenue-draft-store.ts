import { neon } from '@neondatabase/serverless'
import type { ActiveRevenueArtifact } from './active-revenue-artifact.js'
import { buildActiveRevenueMerkleTree } from './active-revenue-merkle.js'

export interface ActiveRevenueDraftStore {
  /** Atomically replace only a draft epoch. Published or expired rows are immutable. */
  replaceDraft(artifact: ActiveRevenueArtifact): Promise<void>
}

export function validateActiveRevenueArtifact(artifact: ActiveRevenueArtifact): void {
  if (artifact.schemaVersion !== 'pollen-active-revenue-v1') {
    throw new Error('unsupported active revenue schema')
  }
  if (artifact.formulaVersion !== 'active-holder-v1') {
    throw new Error('unsupported active revenue formula')
  }
  const pool = BigInt(artifact.poolAtomicUsdc)
  const allocated = BigInt(artifact.totalAllocatedAtomicUsdc)
  const carry = BigInt(artifact.carryAtomicUsdc)
  const cap = BigInt(artifact.capAtomicUsdc)
  const claimTotal = artifact.claims.reduce((sum, claim) => {
    const amount = BigInt(claim.amountAtomicUsdc)
    if (amount <= BigInt(0) || amount > cap) throw new Error('claim violates amount or cap')
    return sum + amount
  }, BigInt(0))
  if (claimTotal !== allocated || allocated + carry !== pool) {
    throw new Error('active revenue accounting mismatch')
  }

  const rebuilt = buildActiveRevenueMerkleTree(artifact.epoch, artifact.claims.map(claim => ({
    contributorId: `public-claim-${claim.index}`,
    walletAddress: claim.walletAddress,
    amountAtomicUsdc: BigInt(claim.amountAtomicUsdc),
  })))
  if (rebuilt.root.toLowerCase() !== artifact.merkleRoot.toLowerCase()) {
    throw new Error('invalid Merkle root')
  }
  for (let index = 0; index < artifact.claims.length; index++) {
    const claim = artifact.claims[index]
    const expected = rebuilt.leaves[index]
    if (
      claim.index !== index
      || claim.walletAddress.toLowerCase() !== expected.walletAddress.toLowerCase()
      || claim.amountAtomicUsdc !== expected.amountAtomicUsdc.toString()
      || JSON.stringify(claim.proof) !== JSON.stringify(expected.proof)
    ) throw new Error(`invalid Merkle proof at index ${index}`)
  }
}

export async function saveActiveRevenueDraft(
  store: ActiveRevenueDraftStore,
  artifact: ActiveRevenueArtifact,
): Promise<void> {
  validateActiveRevenueArtifact(artifact)
  await store.replaceDraft(artifact)
}

export function createActiveRevenueDraftStore(connectionString: string): ActiveRevenueDraftStore {
  const sql = neon(connectionString)
  return {
    async replaceDraft(artifact: ActiveRevenueArtifact): Promise<void> {
      const distribution = sql`
        INSERT INTO active_revenue_distributions (
          epoch, schema_version, formula_version, pollen_token_address,
          snapshot_block, snapshot_timestamp, pool_atomic_usdc, cap_atomic_usdc,
          allocated_atomic_usdc, carry_atomic_usdc, eligible_wallets,
          rejected_contributors, source_digest, merkle_root, status
        ) VALUES (
          ${artifact.epoch}, ${artifact.schemaVersion}, ${artifact.formulaVersion},
          ${artifact.tokenAddress}, ${artifact.snapshotBlock},
          ${new Date(artifact.snapshotTimestamp * 1000).toISOString()},
          ${artifact.poolAtomicUsdc}, ${artifact.capAtomicUsdc},
          ${artifact.totalAllocatedAtomicUsdc}, ${artifact.carryAtomicUsdc},
          ${artifact.eligibleWallets}, ${artifact.rejectedContributors},
          ${artifact.sourceDigest}, ${artifact.merkleRoot}, 'draft'
        )
        ON CONFLICT (epoch) DO UPDATE SET
          schema_version = EXCLUDED.schema_version,
          formula_version = EXCLUDED.formula_version,
          pollen_token_address = EXCLUDED.pollen_token_address,
          snapshot_block = EXCLUDED.snapshot_block,
          snapshot_timestamp = EXCLUDED.snapshot_timestamp,
          pool_atomic_usdc = EXCLUDED.pool_atomic_usdc,
          cap_atomic_usdc = EXCLUDED.cap_atomic_usdc,
          allocated_atomic_usdc = EXCLUDED.allocated_atomic_usdc,
          carry_atomic_usdc = EXCLUDED.carry_atomic_usdc,
          eligible_wallets = EXCLUDED.eligible_wallets,
          rejected_contributors = EXCLUDED.rejected_contributors,
          source_digest = EXCLUDED.source_digest,
          merkle_root = EXCLUDED.merkle_root,
          updated_at = now()
        WHERE active_revenue_distributions.status = 'draft'
        RETURNING epoch
      `
      const deleteClaims = sql`
        DELETE FROM active_revenue_allocations
        WHERE epoch = ${artifact.epoch}
          AND EXISTS (
            SELECT 1 FROM active_revenue_distributions
            WHERE epoch = ${artifact.epoch} AND status = 'draft'
              AND source_digest = ${artifact.sourceDigest}
          )
      `
      const insertClaims = artifact.claims.map(claim => sql`
        INSERT INTO active_revenue_allocations (
          epoch, claim_index, wallet_address, amount_atomic_usdc, proof, status
        )
        SELECT ${artifact.epoch}, ${claim.index}, ${claim.walletAddress},
               ${claim.amountAtomicUsdc}, ${JSON.stringify(claim.proof)}::jsonb, 'draft'
        WHERE EXISTS (
          SELECT 1 FROM active_revenue_distributions
          WHERE epoch = ${artifact.epoch} AND status = 'draft'
            AND source_digest = ${artifact.sourceDigest}
        )
      `)
      const results = await sql.transaction([distribution, deleteClaims, ...insertClaims])
      if ((results[0] as Array<{ epoch: number }>).length !== 1) {
        throw new Error(`active revenue epoch ${artifact.epoch} is already published or expired`)
      }
    },
  }
}
