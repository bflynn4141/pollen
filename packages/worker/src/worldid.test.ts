import { describe, expect, it, vi } from 'vitest'
import { hashSignal } from '@worldcoin/idkit-core/hashing'
import { handleWorldIdVerify, issueRpSignature, type WorldIdEnv } from './worldid'

const env: WorldIdEnv = {
  WORLD_ID_APP_ID: 'app_test',
  WORLD_ID_RP_ID: 'rp_test',
  WORLD_ID_ACTION: 'pollen-verify',
  RP_SIGNING_KEY: `0x${'11'.repeat(32)}`,
  NEON_DATABASE_URL: 'postgres://example.invalid/pollen',
}

describe('World ID Worker handlers', () => {
  it('fails closed when RP signing configuration is missing', () => {
    const sign = vi.fn()

    expect(() => issueRpSignature({ ...env, RP_SIGNING_KEY: '' }, sign)).toThrow(
      'World ID is not configured',
    )
    expect(sign).not.toHaveBeenCalled()
  })

  it('rejects malformed IDKit results before verification', async () => {
    const fetchMock = vi.fn()
    const bindNullifier = vi.fn()
    const request = new Request('https://worker.test/api/v1/worldid/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contributor_id: 'brian-primary', idkit_result: { proof: 'legacy-shape' } }),
    })

    const response = await handleWorldIdVerify(request, env, {
      fetch: fetchMock as typeof fetch,
      bindNullifier,
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ code: 'invalid_idkit_result' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(bindNullifier).not.toHaveBeenCalled()
  })

  it('forwards the IDKit result unchanged and binds the verifier-returned nullifier', async () => {
    const idkitResult = {
      protocol_version: '4.0',
      nonce: `0x${'22'.repeat(32)}`,
      action: 'pollen-verify',
      responses: [{
        identifier: 'proof_of_human',
        signal_hash: hashSignal('brian-primary'),
        proof: ['0x01', '0x02', '0x03', '0x04', '0x05'],
        nullifier: `0x${'44'.repeat(32)}`,
        issuer_schema_id: 1,
        expires_at_min: 1_900_000_000,
      }],
      user_presence_completed: false,
      environment: 'production',
    }
    const verifiedNullifier = idkitResult.responses[0].nullifier
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      results: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const bindNullifier = vi.fn().mockResolvedValue({ ok: true as const })
    const request = new Request('https://worker.test/api/v1/worldid/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contributor_id: 'brian-primary', idkit_result: idkitResult }),
    })

    const response = await handleWorldIdVerify(request, env, {
      fetch: fetchMock as typeof fetch,
      bindNullifier,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://developer.world.org/api/v4/verify/rp_test',
      expect.objectContaining({ body: JSON.stringify(idkitResult) }),
    )
    expect(bindNullifier).toHaveBeenCalledWith(
      env.NEON_DATABASE_URL,
      'brian-primary',
      verifiedNullifier,
      'proof_of_human',
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ success: true, nullifier: verifiedNullifier })
  })
})
