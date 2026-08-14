import { describe, expect, it, vi } from 'vitest'
import { runAdminCommand, type AdminDependencies } from './admin.js'

function dependencies(fetchImpl: typeof fetch): AdminDependencies {
  return {
    apiUrl: 'https://api.test',
    secret: 'admin-secret-value',
    fetchImpl,
  }
}

describe('operator CLI', () => {
  it('creates a one-time invite through the admin API', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      id: 'invite-id',
      code: `pinv_${'a'.repeat(43)}`,
      expires_at: '2026-08-20T00:00:00.000Z',
    }), { status: 201, headers: { 'content-type': 'application/json' } }))

    const result = await runAdminCommand(
      ['invite', 'create', '--days', '7'],
      dependencies(fetchImpl as typeof fetch),
    )

    expect(result.ok).toBe(true)
    expect(result.output).toContain('pinv_')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/admin/invites',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer admin-secret-value' }),
        body: JSON.stringify({ expires_in_days: 7 }),
      }),
    )
  })

  it('renders aggregate contribution health without leaking the admin secret', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      status: 'healthy',
      contributors: { registered: 8, active_tokens: 7 },
      ingest: { receipts_24h: 42, contributors_24h: 6, last_receipt_at: null },
      onboarding: { active_invites: 3 },
      publishing: { receipt_rollup_cells: 18, last_rollup_at: null },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const result = await runAdminCommand(['health'], dependencies(fetchImpl as typeof fetch))

    expect(result.ok).toBe(true)
    expect(result.output).toContain('42 receipts / 6 contributors')
    expect(result.output).not.toContain('admin-secret-value')
  })

  it('lists and revokes invites by opaque id', async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      if (String(input).endsWith('/revoke')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 })
      }
      return new Response(JSON.stringify({ invites: [{
        id: 'invite-id',
        status: 'active',
        created_at: '2026-08-13T00:00:00.000Z',
        expires_at: '2026-08-20T00:00:00.000Z',
        contributor_id: null,
      }] }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    const listed = await runAdminCommand(['invite', 'list'], dependencies(fetchImpl as typeof fetch))
    const revoked = await runAdminCommand(['invite', 'revoke', 'invite-id'], dependencies(fetchImpl as typeof fetch))

    expect(listed.output).toContain('invite-id  active')
    expect(revoked.output).toContain('Revoked invite invite-id')
  })
})
