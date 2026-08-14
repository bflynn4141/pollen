import type Database from 'better-sqlite3'
import { uploadNetworkReceipts } from './network-client.js'
import { buildNetworkReceipt, type NetworkReceiptV1 } from './network-receipt.js'

const BATCH_SIZE = 100
const LEASE_MS = 5 * 60_000
const BASE_RETRY_MS = 30_000
const MAX_RETRY_MS = 60 * 60_000

interface OutboxRow {
  session_id: string
  attempts: number
}

type UploadReceipts = (
  token: string,
  receipts: NetworkReceiptV1[],
  apiUrl?: string,
) => Promise<{ accepted: number; received: number }>

interface DrainOptions {
  contributorId: string
  token: string
  apiUrl?: string
  now?: number
  upload?: UploadReceipts
}

export interface NetworkOutboxResult {
  attempted: number
  synced: number
  accepted: number
  retryScheduled: number
}

/** Add every newly completed, receipt-eligible session to the local outbox. */
export function enqueueEligibleNetworkReceipts(
  db: Database.Database,
  now = Date.now(),
): number {
  return db.prepare(`
    INSERT OR IGNORE INTO network_receipt_outbox (
      session_id, enqueued_at, next_attempt_at
    )
    SELECT session_id, ?, ?
    FROM sessions
    WHERE ended_at IS NOT NULL
      AND model IS NOT NULL
      AND dominant_intent IS NOT NULL
      AND duration_bucket IS NOT NULL
      AND outcome IS NOT NULL
  `).run(now, now).changes
}

function leaseReadyRows(db: Database.Database, now: number): OutboxRow[] {
  const leaseUntil = now + LEASE_MS
  return db.transaction(() => {
    const candidates = db.prepare(`
      SELECT session_id, attempts
      FROM network_receipt_outbox
      WHERE synced_at IS NULL
        AND next_attempt_at <= ?
        AND (lease_until IS NULL OR lease_until <= ?)
      ORDER BY enqueued_at
      LIMIT ?
    `).all(now, now, BATCH_SIZE) as OutboxRow[]
    const lease = db.prepare(`
      UPDATE network_receipt_outbox
      SET lease_until = ?
      WHERE session_id = ?
        AND synced_at IS NULL
        AND next_attempt_at <= ?
        AND (lease_until IS NULL OR lease_until <= ?)
    `)
    return candidates.filter(row => lease.run(leaseUntil, row.session_id, now, now).changes === 1)
  })()
}

function retryDelay(attempts: number): number {
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.min(attempts, 7))
}

/** Lease and upload one batch. Failures remain durable for a later hook/command. */
export async function drainNetworkOutbox(
  db: Database.Database,
  options: DrainOptions,
): Promise<NetworkOutboxResult> {
  const now = options.now ?? Date.now()
  const rows = leaseReadyRows(db, now)
  if (rows.length === 0) {
    return { attempted: 0, synced: 0, accepted: 0, retryScheduled: 0 }
  }

  const receipts = rows.flatMap(row => {
    const receipt = buildNetworkReceipt(db, options.contributorId, row.session_id)
    return receipt ? [receipt] : []
  })
  const sessionIds = rows.map(row => row.session_id)
  if (receipts.length === 0) {
    const release = db.prepare('UPDATE network_receipt_outbox SET lease_until = NULL WHERE session_id = ?')
    db.transaction(() => sessionIds.forEach(id => release.run(id)))()
    return { attempted: rows.length, synced: 0, accepted: 0, retryScheduled: rows.length }
  }

  try {
    const upload = options.upload ?? uploadNetworkReceipts
    const result = await upload(options.token, receipts, options.apiUrl)
    const markSynced = db.prepare(`
      UPDATE network_receipt_outbox
      SET synced_at = ?, lease_until = NULL, last_error = NULL
      WHERE session_id = ?
    `)
    db.transaction(() => sessionIds.forEach(id => markSynced.run(now, id)))()
    return {
      attempted: rows.length,
      synced: rows.length,
      accepted: result.accepted,
      retryScheduled: 0,
    }
  } catch (error) {
    const safeError = (error instanceof Error ? error.message : String(error))
      .replace(/\s+/g, ' ')
      .slice(0, 200)
    const retry = db.prepare(`
      UPDATE network_receipt_outbox
      SET attempts = attempts + 1,
          next_attempt_at = ?,
          lease_until = NULL,
          last_error = ?
      WHERE session_id = ?
    `)
    db.transaction(() => rows.forEach(row => {
      retry.run(now + retryDelay(row.attempts), safeError, row.session_id)
    }))()
    return { attempted: rows.length, synced: 0, accepted: 0, retryScheduled: rows.length }
  }
}

export function getNetworkOutboxStatus(
  db: Database.Database,
): { pending: number; synced: number } {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN synced_at IS NULL THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN synced_at IS NOT NULL THEN 1 ELSE 0 END) AS synced
    FROM network_receipt_outbox
  `).get() as { pending: number | null; synced: number | null }
  return { pending: row.pending ?? 0, synced: row.synced ?? 0 }
}
