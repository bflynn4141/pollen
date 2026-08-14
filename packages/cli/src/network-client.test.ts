import { describe, expect, it, vi } from 'vitest'
import { deleteNetworkContributor, registerNetworkContributor, uploadNetworkReceipts } from './network-client.js'

describe('network client', () => {
  it('registers with the founding-panel invite', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      contributor_id: 'server-contributor',
      token: `pln_${'a'.repeat(43)}`,
      token_type: 'Bearer',
    }), { status: 201, headers: { 'content-type': 'application/json' } }))

    const result = await registerNetworkContributor('invite-code', 'https://api.test', fetchImpl as typeof fetch)

    expect(result.contributorId).toBe('server-contributor')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/v1/contributors/register',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-pollen-invite': 'invite-code' }) }),
    )
  })

  it('preserves a legacy contributor id when joining the receipt network', async () => {
    const contributorId = '2b92eeda-e523-4dd8-b65a-0cf2f272e221'
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      contributor_id: contributorId,
      token: `pln_${'a'.repeat(43)}`,
    }), { status: 201, headers: { 'content-type': 'application/json' } }))

    await registerNetworkContributor('invite-code', 'https://api.test', fetchImpl as typeof fetch, contributorId)

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/v1/contributors/register',
      expect.objectContaining({ body: JSON.stringify({ contributor_id: contributorId }) }),
    )
  })

  it('uploads receipts with the contributor token', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ accepted: 1, received: 1 }),
      { status: 202, headers: { 'content-type': 'application/json' } },
    ))
    const receipt = {
      schema_version: 1 as const,
      receipt_id: '2b92eeda-e523-4dd8-b65a-0cf2f272e221',
      observed_at: 1_786_512_600_000,
      intent: 'feature_build',
      agent: 'codex' as const,
      model: 'gpt-5.2-codex',
      tool_category_sequence: ['read'],
      duration_bucket: 'short',
      terminal_state: 'completed',
      check_result: 'passed',
    }

    const result = await uploadNetworkReceipts(
      `pln_${'a'.repeat(43)}`,
      [receipt],
      'https://api.test',
      fetchImpl as typeof fetch,
    )

    expect(result).toEqual({ accepted: 1, received: 1 })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/v1/receipts',
      expect.objectContaining({ headers: expect.objectContaining({ authorization: `Bearer pln_${'a'.repeat(43)}` }) }),
    )
  })

  it('deletes network data with the locally stored bearer token', async () => {
    const token = `pln_${'a'.repeat(43)}`
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    await deleteNetworkContributor(token, 'https://api.test', fetchImpl as typeof fetch)

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/v1/contributors/me',
      expect.objectContaining({ method: 'DELETE', headers: expect.objectContaining({ authorization: `Bearer ${token}` }) }),
    )
  })
})
