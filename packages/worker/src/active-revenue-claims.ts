import { neon } from '@neondatabase/serverless'
import { getAddress, isAddress, type Hex } from 'viem'

export type ActiveRevenueCutoverStatus = 'planned' | 'live'

export interface ActiveRevenueClaimRow {
  epoch: number
  claimIndex: number
  amountAtomicUsdc: string
  proof: Hex[]
  merkleRoot: Hex
  vaultAddress: string | null
  claimDeadline: string
  distributionStatus: 'draft' | 'published' | 'expired'
  claimStatus: 'draft' | 'published' | 'claimed' | 'expired'
  claimTxHash: string | null
}

export interface ActiveRevenueClaimStore {
  readWalletClaims(walletAddress: string): Promise<ActiveRevenueClaimRow[]>
}

export function createActiveRevenueClaimStore(connectionString: string): ActiveRevenueClaimStore {
  const sql = neon(connectionString)
  return {
    async readWalletClaims(walletAddress: string): Promise<ActiveRevenueClaimRow[]> {
      const rows = await sql`
        SELECT a.epoch, a.claim_index, a.amount_atomic_usdc::text,
               a.proof, a.status AS claim_status, a.claim_tx_hash,
               d.merkle_root, d.vault_address, d.claim_deadline,
               d.status AS distribution_status
        FROM active_revenue_allocations a
        JOIN active_revenue_distributions d ON d.epoch = a.epoch
        WHERE lower(a.wallet_address) = lower(${walletAddress})
          AND d.status IN ('published', 'expired')
        ORDER BY a.epoch DESC, a.claim_index
      `
      return rows.map(row => ({
        epoch: Number(row.epoch),
        claimIndex: Number(row.claim_index),
        amountAtomicUsdc: String(row.amount_atomic_usdc),
        proof: row.proof as Hex[],
        merkleRoot: row.merkle_root as Hex,
        vaultAddress: row.vault_address ? String(row.vault_address) : null,
        claimDeadline: new Date(row.claim_deadline as string).toISOString(),
        distributionStatus: row.distribution_status as ActiveRevenueClaimRow['distributionStatus'],
        claimStatus: row.claim_status as ActiveRevenueClaimRow['claimStatus'],
        claimTxHash: row.claim_tx_hash ? String(row.claim_tx_hash) : null,
      }))
    },
  }
}

export async function handleActiveRevenueClaims(
  walletAddress: string,
  store: ActiveRevenueClaimStore,
  cutoverStatus: ActiveRevenueCutoverStatus,
  nowMs: number = Date.now(),
): Promise<Response> {
  if (!isAddress(walletAddress)) {
    return Response.json({ error: 'invalid_wallet_address' }, { status: 400 })
  }
  const normalized = getAddress(walletAddress)
  const rows = await store.readWalletClaims(normalized)
  const claims = rows.map(row => ({
    epoch: row.epoch,
    index: row.claimIndex,
    amount_atomic_usdc: row.amountAtomicUsdc,
    proof: row.proof,
    merkle_root: row.merkleRoot,
    vault_address: row.vaultAddress,
    claim_deadline: row.claimDeadline,
    status: row.claimStatus,
    claim_tx_hash: row.claimTxHash,
  }))
  const totalClaimable = rows.reduce((total, row) => {
    const open = row.distributionStatus === 'published'
      && row.claimStatus === 'published'
      && Date.parse(row.claimDeadline) >= nowMs
    return total + (open ? BigInt(row.amountAtomicUsdc) : 0n)
  }, 0n)

  return Response.json({
    formula: 'active-holder-v1',
    cutover_status: cutoverStatus,
    wallet_address: normalized,
    total_claimable_atomic_usdc: totalClaimable.toString(),
    claims,
  }, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  })
}
