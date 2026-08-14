import { describe, expect, it, vi } from 'vitest'
import { handleContributionHealth, type OperationsDependencies } from './operations.js'

describe('contribution operations health', () => {
  it('reports ingest, invite, and rollup health without raw contributor data', async () => {
    const deps: OperationsDependencies = {
      readHealth: vi.fn(async () => ({
        registered_contributors: 8,
        active_tokens: 7,
        receipts_24h: 42,
        contributors_24h: 6,
        last_receipt_at: '2026-08-13T23:59:00.000Z',
        active_invites: 3,
        receipt_rollup_cells: 18,
        last_rollup_at: '2026-08-13T23:55:00.000Z',
      })),
    }

    const response = await handleContributionHealth(deps)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      status: 'healthy',
      ingest: { receipts_24h: 42, contributors_24h: 6 },
      onboarding: { active_invites: 3 },
      publishing: { receipt_rollup_cells: 18 },
    })
    expect(JSON.stringify(body)).not.toMatch(/token_hash|contributor_id|receipt_id/)
  })
})
