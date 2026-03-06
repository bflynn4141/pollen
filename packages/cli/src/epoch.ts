/**
 * Epoch module — Merkle proof fetching and token emission schedule.
 */
import { neon } from '@neondatabase/serverless'
import type { Address } from 'viem'

/**
 * Token emission per epoch (in wei, 18 decimals).
 *
 * Starts at 100,000 POLLEN per epoch, halves every 13 epochs (~quarterly).
 * This gives a total supply approaching 2.6M POLLEN.
 */
export function epochPool(epochNumber: number): bigint {
  const halvings = Math.floor((epochNumber - 1) / 13)
  const base = 100_000n * 10n ** 18n // 100k POLLEN
  return base >> BigInt(halvings) // right-shift = halve
}

/**
 * Fetch Merkle proof for a contributor's claim.
 * Returns null if no proof exists (contributor has nothing to claim).
 */
export async function getMerkleProof(
  connectionString: string,
  epochId: number,
  walletAddress: Address,
): Promise<{ cumulativeAmount: string; proof: string[] } | null> {
  const sql = neon(connectionString)

  try {
    const [row] = await sql`
      SELECT cumulative_amount, proof
      FROM merkle_proofs
      WHERE epoch_id = ${epochId}
        AND wallet_address = ${walletAddress.toLowerCase()}
    `

    if (!row) return null

    return {
      cumulativeAmount: row.cumulative_amount as string,
      proof: row.proof as string[],
    }
  } catch {
    // Table doesn't exist yet
    return null
  }
}
