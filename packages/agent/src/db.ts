/**
 * Neon data layer for the payout agent.
 *
 * Tables (packages/site/migrations/003_contributors.sql):
 *   epoch_scores(epoch, contributor_id, score NUMERIC, breakdown JSONB, computed_at)
 *   contributors(contributor_id, wallet_address, wallet_binding_sig,
 *                world_id_nullifier, verification_level, verified_at, updated_at)
 *   payouts(epoch, contributor_id, wallet_address, amount NUMERIC,
 *           tx_hash, status, created_at, PK(epoch, contributor_id))
 *
 * payouts.amount stores whole POLLEN tokens (formatUnits(wei, 18)) per the
 * migration's column comment. While status='pending', tx_hash stores the
 * durable Splits proposal ID; confirmation replaces it with the chain hash.
 */
import { neon } from '@neondatabase/serverless'
import { formatUnits } from 'viem'
import type { EligibleScore, PayoutAmount } from './prorata.js'

export interface ExistingPayout {
  contributor_id: string
  wallet_address: string
  amount: string
  tx_hash: string | null
  status: string
}

/** Store abstraction so payout logic is unit-testable without a database. */
export interface PayoutStore {
  /** Total epoch_scores rows for the epoch (pre-eligibility) — 0 means epoch-close never ran. */
  countEpochScores(epoch: number): Promise<number>
  /** Verified + wallet-registered contributors with a score for the epoch. */
  fetchEligibleScores(epoch: number): Promise<EligibleScore[]>
  fetchPayouts(epoch: number): Promise<ExistingPayout[]>
  /** Insert status='pending' rows; existing rows (resume) are left untouched. */
  insertPendingPayouts(epoch: number, rows: PayoutAmount[]): Promise<void>
  /** Atomically bind every row in a chunk to its unsigned Splits proposal. */
  savePendingTransaction(epoch: number, contributorIds: string[], transactionId: string): Promise<void>
  markPayouts(epoch: number, contributorIds: string[], status: 'confirmed' | 'failed', txHash: string | null): Promise<void>
}

export function createNeonStore(connectionString: string): PayoutStore {
  const sql = neon(connectionString)

  return {
    async countEpochScores(epoch: number): Promise<number> {
      const rows = await sql`SELECT COUNT(*)::int AS n FROM epoch_scores WHERE epoch = ${epoch}`
      return Number(rows[0]?.n ?? 0)
    },

    async fetchEligibleScores(epoch: number): Promise<EligibleScore[]> {
      const rows = await sql`
        SELECT es.contributor_id, es.score::text AS score, c.wallet_address
        FROM epoch_scores es
        JOIN contributors c ON c.contributor_id = es.contributor_id
        WHERE es.epoch = ${epoch}
          AND c.world_id_nullifier IS NOT NULL
          AND c.verified_at IS NOT NULL
          AND c.wallet_address IS NOT NULL
        ORDER BY es.contributor_id
      `
      return rows.map(r => ({
        contributor_id: r.contributor_id as string,
        wallet_address: r.wallet_address as string,
        score: r.score as string,
      }))
    },

    async fetchPayouts(epoch: number): Promise<ExistingPayout[]> {
      const rows = await sql`
        SELECT contributor_id, wallet_address, amount::text AS amount, tx_hash, status
        FROM payouts
        WHERE epoch = ${epoch}
        ORDER BY contributor_id
      `
      return rows.map(r => ({
        contributor_id: r.contributor_id as string,
        wallet_address: r.wallet_address as string,
        amount: r.amount as string,
        tx_hash: (r.tx_hash as string | null) ?? null,
        status: r.status as string,
      }))
    },

    async insertPendingPayouts(epoch: number, rows: PayoutAmount[]): Promise<void> {
      for (const row of rows) {
        await sql`
          INSERT INTO payouts (epoch, contributor_id, wallet_address, amount, status)
          VALUES (
            ${epoch}, ${row.contributor_id}, ${row.wallet_address},
            ${formatUnits(row.amountWei, 18)}, 'pending'
          )
          ON CONFLICT (epoch, contributor_id) DO NOTHING
        `
      }
    },

    async savePendingTransaction(
      epoch: number,
      contributorIds: string[],
      transactionId: string,
    ): Promise<void> {
      await sql`
        UPDATE payouts
        SET status = 'pending', tx_hash = ${transactionId}
        WHERE epoch = ${epoch} AND contributor_id = ANY(${contributorIds}::text[])
      `
    },

    async markPayouts(
      epoch: number,
      contributorIds: string[],
      status: 'confirmed' | 'failed',
      txHash: string | null,
    ): Promise<void> {
      await sql`
        UPDATE payouts
        SET status = ${status}, tx_hash = ${txHash}
        WHERE epoch = ${epoch} AND contributor_id = ANY(${contributorIds}::text[])
      `
    },
  }
}
