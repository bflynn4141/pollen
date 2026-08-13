import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

describe('World ID production configuration', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.doUnmock('@worldcoin/idkit-core')
    vi.resetModules()
  })

  it('ships production World IDs so a public CLI install works without hidden environment setup', async () => {
    vi.stubEnv('WORLD_ID_APP_ID', '')
    vi.stubEnv('WORLD_ID_RP_ID', '')

    const { APP_ID, RP_ID } = await import('./worldid.js')

    expect(APP_ID).toBe('app_a78733c7bfb32f86874803a9e9dd3ee3')
    expect(RP_ID).toBe('rp_6e4e8b15687b4d76')
  })

  it('loads IDKit file URLs locally instead of passing them to Node fetch', async () => {
    const fallback = vi.fn()
    const { fetchIdKitResource } = await import('./worldid.js')
    const entryUrl = pathToFileURL(createRequire(import.meta.url).resolve('@worldcoin/idkit-core'))
    const wasmUrl = new URL('idkit_wasm_bg.wasm', entryUrl)

    const response = await fetchIdKitResource(wasmUrl, undefined, fallback)

    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toBe('application/wasm')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('requests Orb proof of human while keeping RP signatures and proof verification on separate production services', async () => {
    vi.stubEnv('WORLD_ID_APP_ID', 'app_test')
    vi.stubEnv('WORLD_ID_RP_ID', 'rp_test')
    vi.stubEnv('WORLD_ID_ACTION', 'pollen-verify-v6')
    vi.stubEnv('POLLEN_API_URL', '')
    vi.stubEnv('POLLEN_WORLD_ID_VERIFY_URL', '')

    const request = {
      requestId: 'request_test',
      connectorURI: 'https://world.org/verify?t=wld&i=request_test',
    }
    const applyConstraints = vi.fn().mockResolvedValue(request)
    const requestIdKit = vi.fn().mockReturnValue({ constraints: applyConstraints })
    const requestWithInviteCode = vi.fn().mockReturnValue({ constraints: applyConstraints })
    const CredentialRequest = vi.fn().mockReturnValue({
      type: 'proof_of_human',
      signal: 'brian-primary',
    })
    vi.doMock('@worldcoin/idkit-core', () => ({
      IDKit: { request: requestIdKit, requestWithInviteCode },
      CredentialRequest,
    }))

    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      app_id: 'app_test',
      rp_id: 'rp_test',
      action: 'pollen-verify-v6',
      sig: '0xsignature',
      nonce: '0xnonce',
      created_at: 1,
      expires_at: 2,
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        code: 'world_id_rejected',
        detail: 'The World verifier rejected this proof',
      }), { status: 403, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const { createBridgeSession, verifyProof } = await import('./worldid.js')
    const session = await createBridgeSession('brian-primary')
    const verification = await verifyProof({ protocol_version: '4.0' } as never, 'brian-primary')

    expect(requestIdKit).toHaveBeenCalledWith(expect.objectContaining({
      app_id: 'app_test',
      action: 'pollen-verify-v6',
      allow_legacy_proofs: false,
      environment: 'production',
    }))
    expect(requestWithInviteCode).not.toHaveBeenCalled()
    expect(CredentialRequest).toHaveBeenCalledWith('proof_of_human', {
      signal: 'brian-primary',
    })
    expect(applyConstraints).toHaveBeenCalledWith({
      type: 'proof_of_human',
      signal: 'brian-primary',
    })
    expect(session.requestId).toBe('request_test')
    expect(session.connectorURI).toBe('https://world.org/verify?t=wld&i=request_test')
    expect(session.request).toBe(request)
    expect(request.connectorURI).toBe('https://world.org/verify?t=wld&i=request_test')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://pollen-api.bflynn4141.workers.dev/api/v1/worldid/rp-signature',
    )
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://site-alpha-umber-69.vercel.app/api/v1/worldid/verify',
    )
    expect(verification).toEqual({
      success: false,
      code: 'world_id_rejected',
      detail: 'The World verifier rejected this proof',
    })
  })

  it('allows the World verifier endpoint to be overridden independently', async () => {
    vi.stubEnv('POLLEN_API_URL', 'https://signature.test')
    vi.stubEnv('POLLEN_WORLD_ID_VERIFY_URL', 'https://verifier.test/custom')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      nullifier: 'nullifier_test',
      verification_level: 'proof_of_human',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const { verifyProof } = await import('./worldid.js')
    await verifyProof({ protocol_version: '4.0' } as never, 'brian-primary')

    expect(fetchMock).toHaveBeenCalledWith('https://verifier.test/custom', expect.objectContaining({
      method: 'POST',
    }))
  })

  it('stops polling when the five-minute RP signature expires', async () => {
    const pollUntilCompletion = vi.fn().mockResolvedValue({
      success: false,
      error: 'timeout',
    })
    const { pollForProof } = await import('./worldid.js')

    await expect(pollForProof({
      requestId: 'request_test',
      connectorURI: 'https://world.org/verify?t=wld&i=request_test',
      request: { pollUntilCompletion } as never,
    })).rejects.toMatchObject({ code: 'timeout' })
    expect(pollUntilCompletion).toHaveBeenCalledWith({
      timeout: 300_000,
      pollInterval: 2_000,
    })
  })

  it.each([
    ['timeout', 'The verification link expired after 5 minutes. Run `pollen verify` again for a fresh link.'],
    ['user_rejected', 'You cancelled the request in World ID App. Run `pollen verify` when you are ready to try again.'],
    ['verification_rejected', 'World ID App rejected this verification. Run `pollen verify` to try again.'],
    ['credential_unavailable', 'This World ID account does not have the Orb-backed Proof of Human credential required by Pollen.'],
    ['world_id_4_not_available', 'This World ID account does not have the Orb-backed Proof of Human credential required by Pollen.'],
    ['connection_failed', 'World ID verification failed (connection_failed). Run `pollen verify` to try again.'],
  ])('turns the %s poll code into a clear recovery message', async (code, message) => {
    const { formatPollFailure } = await import('./worldid.js')

    expect(formatPollFailure(Object.assign(new Error(`World App error: ${code}`), { code })))
      .toBe(message)
  })
})
