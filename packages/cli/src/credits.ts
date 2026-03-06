/**
 * Credits module — epoch scoring and contributor credit queries.
 *
 * Queries Neon for contributor scores and epoch metadata.
 */
import { neon } from '@neondatabase/serverless'

export interface EpochRow {
  epoch_id: number
  starts_at: number
  ends_at: number
  total_credits: number
  status: 'open' | 'closed' | 'published'
  merkle_root: string | null
}

// Epoch 1 starts on 2026-02-24 (Monday UTC)
const EPOCH_ORIGIN = Date.UTC(2026, 1, 24) // Feb 24, 2026
const EPOCH_DURATION_MS = 7 * 24 * 60 * 60 * 1000 // 1 week

/**
 * Get the current epoch number (1-indexed, weekly).
 */
export function currentEpoch(): number {
  const now = Date.now()
  return Math.floor((now - EPOCH_ORIGIN) / EPOCH_DURATION_MS) + 1
}

/**
 * Get start/end timestamps for an epoch.
 */
export function epochBounds(epoch: number): { starts_at: number; ends_at: number } {
  const starts_at = EPOCH_ORIGIN + (epoch - 1) * EPOCH_DURATION_MS
  const ends_at = starts_at + EPOCH_DURATION_MS
  return { starts_at, ends_at }
}

/**
 * List all epochs from Neon.
 * Falls back to computing from current epoch if table doesn't exist.
 */
export async function listEpochs(connectionString: string): Promise<EpochRow[]> {
  const sql = neon(connectionString)
  try {
    const rows = await sql`
      SELECT epoch_id, starts_at, ends_at, total_credits, status, merkle_root
      FROM payout_epochs
      ORDER BY epoch_id DESC
    `
    return rows as unknown as EpochRow[]
  } catch {
    // Table doesn't exist yet — return computed epochs
    const current = currentEpoch()
    const epochs: EpochRow[] = []
    for (let e = current; e >= Math.max(1, current - 3); e--) {
      const bounds = epochBounds(e)
      epochs.push({
        epoch_id: e,
        starts_at: bounds.starts_at,
        ends_at: bounds.ends_at,
        total_credits: 0,
        status: e === current ? 'open' : 'closed',
        merkle_root: null,
      })
    }
    return epochs
  }
}

/**
 * Get contributor scores (total + by epoch).
 */
export async function getContributorScores(
  connectionString: string,
  contributorId: string,
): Promise<{ total: number; byEpoch: Array<{ epoch: number; score: number }> }> {
  const sql = neon(connectionString)

  try {
    // Try the scoring table first
    const rows = await sql`
      SELECT epoch, SUM(score) as total_score
      FROM contributor_scores
      WHERE contributor_id = ${contributorId}
      GROUP BY epoch
      ORDER BY epoch DESC
    `
    const byEpoch = rows.map(r => ({
      epoch: r.epoch as number,
      score: Number(r.total_score),
    }))
    const total = byEpoch.reduce((sum, e) => sum + e.score, 0)
    return { total, byEpoch }
  } catch {
    // Fallback: count contributions per epoch
    try {
      const current = currentEpoch()
      const byEpoch: Array<{ epoch: number; score: number }> = []

      for (let e = current; e >= Math.max(1, current - 3); e--) {
        const bounds = epochBounds(e)
        const [row] = await sql`
          SELECT COUNT(*) as cnt
          FROM contributions
          WHERE contributor_id = ${contributorId}
            AND timestamp >= ${bounds.starts_at}
            AND timestamp < ${bounds.ends_at}
        `
        const score = Number(row?.cnt ?? 0)
        if (score > 0) {
          byEpoch.push({ epoch: e, score })
        }
      }

      const total = byEpoch.reduce((sum, e) => sum + e.score, 0)
      return { total, byEpoch }
    } catch {
      return { total: 0, byEpoch: [] }
    }
  }
}
