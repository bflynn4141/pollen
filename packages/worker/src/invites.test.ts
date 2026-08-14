import { describe, expect, it, vi } from 'vitest'
import {
  handleCreateInvite,
  handleListInvites,
  handleRevokeInvite,
  type InviteDependencies,
} from './invites'

function dependencies(overrides: Partial<InviteDependencies> = {}): InviteDependencies {
  return {
    createInvite: vi.fn(async () => undefined),
    revokeInvite: vi.fn(async () => true),
    listInvites: vi.fn(async () => []),
    ...overrides,
  }
}

describe('invite administration', () => {
  it('returns a one-time invite while storing only its hash', async () => {
    const deps = dependencies()
    const response = await handleCreateInvite(
      new Request('https://api.test/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expires_in_days: 7 }),
      }),
      deps,
    )
    const body = await response.json() as { id: string; code: string; expires_at: string }

    expect(response.status).toBe(201)
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.code).toMatch(/^pinv_[A-Za-z0-9_-]{43}$/)
    expect(Date.parse(body.expires_at)).toBeGreaterThan(Date.now())
    expect(deps.createInvite).toHaveBeenCalledWith(
      body.id,
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.any(Date),
    )
    expect(deps.createInvite).not.toHaveBeenCalledWith(
      expect.anything(),
      body.code,
      expect.anything(),
    )
  })

  it('revokes an unused invite by id', async () => {
    const deps = dependencies()
    const response = await handleRevokeInvite(
      new Request('https://api.test/admin/invites/invite-id/revoke', { method: 'POST' }),
      'invite-id',
      deps,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(deps.revokeInvite).toHaveBeenCalledWith('invite-id')
  })

  it('returns not found when an invite cannot be revoked', async () => {
    const response = await handleRevokeInvite(
      new Request('https://api.test/admin/invites/missing/revoke', { method: 'POST' }),
      'missing',
      dependencies({ revokeInvite: vi.fn(async () => false) }),
    )

    expect(response.status).toBe(404)
  })

  it('lists invite metadata without ever returning code hashes or raw codes', async () => {
    const deps = dependencies({
      listInvites: vi.fn(async () => [{
        id: 'invite-id',
        status: 'active',
        created_at: '2026-08-13T00:00:00.000Z',
        expires_at: '2026-08-20T00:00:00.000Z',
        contributor_id: null,
      }]),
    })
    const response = await handleListInvites(deps)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ invites: [expect.objectContaining({ id: 'invite-id', status: 'active' })] })
    expect(JSON.stringify(body)).not.toMatch(/code|hash|pinv_/i)
  })
})
