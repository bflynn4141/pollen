import { describe, expect, it, vi } from 'vitest'
import { initDb } from './store.js'
import {
  drainNetworkOutbox,
  enqueueEligibleNetworkReceipts,
  getNetworkOutboxStatus,
  requeueNetworkReceipt,
  runNetworkOutboxWorker,
} from './network-outbox.js'

const NOW = 1_786_512_900_000

function insertCompletedSession(db: ReturnType<typeof initDb>, sessionId: string): void {
  db.prepare(`
    INSERT INTO sessions (
      session_id, model, source, started_at, ended_at, duration_bucket,
      dominant_intent, outcome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    'gpt-5.6-sol',
    'codex',
    NOW - 60_000,
    NOW - 1_000,
    'quick',
    'feature_build',
    'completed',
  )
}

describe('durable network receipt outbox', () => {
  it('enqueues completed sessions and marks them synced only after upload succeeds', async () => {
    const db = initDb()
    insertCompletedSession(db, 'session-1')
    const upload = vi.fn(async (_token, receipts) => ({
      accepted: receipts.length,
      received: receipts.length,
    }))

    expect(enqueueEligibleNetworkReceipts(db, NOW)).toBe(1)
    const result = await drainNetworkOutbox(db, {
      contributorId: 'contributor-1',
      token: `pln_${'a'.repeat(43)}`,
      apiUrl: 'https://api.test',
      now: NOW,
      upload,
    })

    expect(result).toEqual({ attempted: 1, synced: 1, accepted: 1, retryScheduled: 0 })
    expect(upload).toHaveBeenCalledOnce()
    expect(upload.mock.calls[0][1]).toEqual([
      expect.objectContaining({
        schema_version: 4,
        model: 'gpt-5.6-sol',
        mcp_calls: [],
        tool_attributions: [],
        token_usage: {
          input_tokens: null,
          output_tokens: null,
          cached_input_tokens: null,
          reasoning_tokens: null,
        },
      }),
    ])
    expect(getNetworkOutboxStatus(db)).toEqual({ pending: 0, synced: 1 })
    db.close()
  })

  it('requeues an already-synced receipt after token backfill changes it', async () => {
    const db = initDb()
    insertCompletedSession(db, 'session-backfilled')
    enqueueEligibleNetworkReceipts(db, NOW)
    await drainNetworkOutbox(db, {
      contributorId: 'contributor-1',
      token: `pln_${'a'.repeat(43)}`,
      now: NOW,
      upload: async (_token, receipts) => ({ accepted: receipts.length, received: receipts.length }),
    })

    expect(requeueNetworkReceipt(db, 'session-backfilled', NOW + 1)).toBe(1)
    expect(getNetworkOutboxStatus(db)).toEqual({ pending: 1, synced: 0 })
    expect(requeueNetworkReceipt(db, 'session-backfilled', NOW + 2)).toBe(0)
    db.close()
  })

  it('retains failed uploads with backoff and retries them later', async () => {
    const db = initDb()
    insertCompletedSession(db, 'session-retry')
    enqueueEligibleNetworkReceipts(db, NOW)
    const upload = vi.fn(async () => { throw new Error('API offline') })

    const failed = await drainNetworkOutbox(db, {
      contributorId: 'contributor-1',
      token: `pln_${'a'.repeat(43)}`,
      now: NOW,
      upload,
    })
    const tooSoon = await drainNetworkOutbox(db, {
      contributorId: 'contributor-1',
      token: `pln_${'a'.repeat(43)}`,
      now: NOW + 1,
      upload,
    })

    expect(failed).toEqual({ attempted: 1, synced: 0, accepted: 0, retryScheduled: 1 })
    expect(tooSoon.attempted).toBe(0)
    expect(upload).toHaveBeenCalledOnce()
    expect(getNetworkOutboxStatus(db)).toEqual({ pending: 1, synced: 0 })
    db.close()
  })

  it('automatically retries a failed upload without permanent polling', async () => {
    const db = initDb()
    insertCompletedSession(db, 'session-worker-retry')
    enqueueEligibleNetworkReceipts(db, NOW)
    let current = NOW
    const sleeps: number[] = []
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error('API offline'))
      .mockResolvedValueOnce({ accepted: 1, received: 1 })

    const result = await runNetworkOutboxWorker(db, {
      contributorId: 'contributor-1',
      token: `pln_${'a'.repeat(43)}`,
      upload,
      now: () => current,
      sleep: async milliseconds => {
        sleeps.push(milliseconds)
        current += milliseconds
      },
    })

    expect(upload).toHaveBeenCalledTimes(2)
    expect(sleeps).toEqual([30_000])
    expect(result).toEqual({ attempted: 2, synced: 1, accepted: 1, pending: 0 })
    db.close()
  })

  it('leases a batch so concurrent workers cannot upload it twice', async () => {
    const db = initDb()
    insertCompletedSession(db, 'session-leased')
    enqueueEligibleNetworkReceipts(db, NOW)
    let releaseUpload: (() => void) | undefined
    const upload = vi.fn(() => new Promise<{ accepted: number; received: number }>(resolve => {
      releaseUpload = () => resolve({ accepted: 1, received: 1 })
    }))

    const first = drainNetworkOutbox(db, {
      contributorId: 'contributor-1',
      token: `pln_${'a'.repeat(43)}`,
      now: NOW,
      upload,
    })
    const second = await drainNetworkOutbox(db, {
      contributorId: 'contributor-1',
      token: `pln_${'a'.repeat(43)}`,
      now: NOW,
      upload,
    })
    releaseUpload?.()

    expect(second.attempted).toBe(0)
    expect((await first).synced).toBe(1)
    expect(upload).toHaveBeenCalledOnce()
    db.close()
  })
})
