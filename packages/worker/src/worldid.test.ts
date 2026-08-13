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

type SelfieOverride = {
  action?: string
  environment?: string
  signalHash?: string
  identifier?: string
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
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_idkit_result',
      detail: 'IDKit result failed validation at protocol',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(bindNullifier).not.toHaveBeenCalled()
  })

  const privateValues = {
    nonce: `0x${'a1'.repeat(32)}`,
    nullifier: `0x${'b2'.repeat(32)}`,
    signal: `0x${'c3'.repeat(32)}`,
    proof: `0x${'d4'.repeat(32)}`,
    signature: `0x${'e5'.repeat(65)}`,
  }

  const validDiagnosticResult = {
    protocol_version: '4.0',
    nonce: privateValues.nonce,
    action: 'pollen-verify',
    environment: 'production',
    responses: [{
      identifier: 'proof_of_human',
      signal_hash: hashSignal('brian-primary'),
      proof: ['0x01', '0x02', '0x03', '0x04', '0x05'],
      nullifier: privateValues.nullifier,
      issuer_schema_id: 1,
    }],
    signature: privateValues.signature,
  }

  const diagnosticFailures = [
    ['protocol', { ...validDiagnosticResult, protocol_version: '3.0' }],
    ['action', { ...validDiagnosticResult, action: 'different-action' }],
    ['environment', { ...validDiagnosticResult, environment: 'staging' }],
    ['response_count', { ...validDiagnosticResult, responses: [] }],
    ['identifier', {
      ...validDiagnosticResult,
      responses: [{ ...validDiagnosticResult.responses[0], identifier: 'selfie' }],
    }],
    ['issuer_schema', {
      ...validDiagnosticResult,
      responses: [{ ...validDiagnosticResult.responses[0], issuer_schema_id: 11 }],
    }],
    ['signal', {
      ...validDiagnosticResult,
      responses: [{ ...validDiagnosticResult.responses[0], signal_hash: privateValues.signal }],
    }],
    ['nullifier', {
      ...validDiagnosticResult,
      responses: [{ ...validDiagnosticResult.responses[0], nullifier: 'not-hex' }],
    }],
    ['proof', {
      ...validDiagnosticResult,
      responses: [{
        identifier: validDiagnosticResult.responses[0].identifier,
        signal_hash: validDiagnosticResult.responses[0].signal_hash,
        nullifier: validDiagnosticResult.responses[0].nullifier,
        issuer_schema_id: validDiagnosticResult.responses[0].issuer_schema_id,
      }],
    }],
  ] as const

  it.each(diagnosticFailures)('returns a privacy-safe diagnostic for the %s validation stage', async (stage, idkitResult) => {
    const response = await handleWorldIdVerify(new Request('https://worker.test/api/v1/worldid/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contributor_id: 'brian-primary', idkit_result: idkitResult }),
    }), env, { fetch: vi.fn() as typeof fetch, bindNullifier: vi.fn() })

    expect(response.status).toBe(400)
    const responseText = await response.text()
    expect(JSON.parse(responseText)).toEqual({
      success: false,
      code: 'invalid_idkit_result',
      detail: `IDKit result failed validation at ${stage}`,
    })
    for (const privateValue of Object.values(privateValues)) {
      expect(responseText).not.toContain(privateValue)
    }
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

  it('accepts equivalent unpadded v4 hex values and forwards them unchanged', async () => {
    const paddedSignalHash = hashSignal('brian-primary')
    const idkitResult = {
      protocol_version: '4.0',
      nonce: `0x${'22'.repeat(32)}`,
      action: 'pollen-verify',
      responses: [{
        identifier: 'proof_of_human',
        signal_hash: `0x${paddedSignalHash.slice(2).replace(/^0+/, '')}`,
        proof: ['0x1', '0x2', '0x3', '0x4', '0x5'],
        nullifier: '0x44',
        issuer_schema_id: 1,
        expires_at_min: 1_900_000_000,
      }],
      user_presence_completed: false,
      environment: 'production',
    }
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

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://developer.world.org/api/v4/verify/rp_test',
      expect.objectContaining({ body: JSON.stringify(idkitResult) }),
    )
    expect(bindNullifier).toHaveBeenCalledWith(
      env.NEON_DATABASE_URL,
      'brian-primary',
      '0x44',
      'proof_of_human',
    )
  })

  it('accepts the live schema-1 orb alias, forwards it unchanged, and stores canonical PoH', async () => {
    const idkitResult = {
      protocol_version: '4.0',
      nonce: `0x${'22'.repeat(32)}`,
      action: 'pollen-verify',
      responses: [{
        identifier: 'orb',
        signal_hash: hashSignal('brian-primary'),
        proof: ['0x1', '0x2', '0x3', '0x4', '0x5'],
        nullifier: '0x0044',
        issuer_schema_id: 1,
        expires_at_min: 1_900_000_000,
      }],
      user_presence_completed: false,
      environment: 'production',
    }
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
      '0x44',
      'proof_of_human',
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      nullifier: '0x44',
      verification_level: 'proof_of_human',
    })
  })

  it('treats proof serialization as opaque and forwards it unchanged to World', async () => {
    const idkitResult = {
      protocol_version: '4.0',
      nonce: `0x${'22'.repeat(32)}`,
      action: 'pollen-verify',
      responses: [{
        identifier: 'orb',
        signal_hash: hashSignal('brian-primary'),
        proof: { protocol_owned_encoding: ['not', 'locally', 'interpreted'] },
        nullifier: '0x44',
        issuer_schema_id: 1,
        expires_at_min: 1_900_000_000,
      }],
      user_presence_completed: false,
      environment: 'production',
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      results: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const bindNullifier = vi.fn().mockResolvedValue({ ok: true as const })

    const response = await handleWorldIdVerify(new Request(
      'https://worker.test/api/v1/worldid/verify',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contributor_id: 'brian-primary', idkit_result: idkitResult }),
      },
    ), env, { fetch: fetchMock as typeof fetch, bindNullifier })

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://developer.world.org/api/v4/verify/rp_test',
      expect.objectContaining({ body: JSON.stringify(idkitResult) }),
    )
  })

  it('canonicalizes a World-verified padded nullifier before binding and returning it', async () => {
    const idkitResult = {
      protocol_version: '4.0',
      nonce: `0x${'22'.repeat(32)}`,
      action: 'pollen-verify',
      responses: [{
        identifier: 'proof_of_human',
        signal_hash: hashSignal('brian-primary'),
        proof: ['0x01', '0x02', '0x03', '0x04', '0x05'],
        nullifier: '0x0044',
        issuer_schema_id: 1,
      }],
      user_presence_completed: false,
      environment: 'production',
    }
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
      '0x44',
      'proof_of_human',
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ success: true, nullifier: '0x44' })
  })

  const invalidV4HexFields = [
    ['empty nullifier', { nullifier: '0x' }],
    ['non-hex nullifier', { nullifier: '0xzz' }],
    ['oversized nullifier', { nullifier: `0x${'1'.repeat(65)}` }],
    ['different signal value', { signal_hash: '0x01' }],
  ] as const

  it.each(invalidV4HexFields)('rejects a v4 result with %s', async (_label, override) => {
    const idkitResult = {
      protocol_version: '4.0',
      nonce: `0x${'22'.repeat(32)}`,
      action: 'pollen-verify',
      responses: [{
        identifier: 'proof_of_human',
        signal_hash: hashSignal('brian-primary'),
        proof: ['0x01', '0x02', '0x03', '0x04', '0x05'],
        nullifier: '0x44',
        issuer_schema_id: 1,
        ...override,
      }],
      user_presence_completed: false,
      environment: 'production',
    }
    const fetchMock = vi.fn()
    const bindNullifier = vi.fn()
    const request = new Request('https://worker.test/api/v1/worldid/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contributor_id: 'brian-primary', idkit_result: idkitResult }),
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

  it('rejects a verified Selfie Check proof because payouts require Orb-backed proof of human', async () => {
    const idkitResult = {
      protocol_version: '3.0',
      nonce: `0x${'22'.repeat(32)}`,
      action: 'pollen-verify',
      responses: [{
        identifier: 'selfie',
        signal_hash: hashSignal('brian-primary'),
        proof: `0x${'33'.repeat(256)}`,
        merkle_root: `0x${'55'.repeat(32)}`,
        nullifier: `0x${'44'.repeat(32)}`,
      }],
      user_presence_completed: true,
      environment: 'production',
    }
    const fetchMock = vi.fn()
    const bindNullifier = vi.fn()
    const request = new Request('https://worker.test/api/v1/worldid/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contributor_id: 'brian-primary', idkit_result: idkitResult }),
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

  const invalidSelfieResults: Array<[string, SelfieOverride]> = [
    ['wrong action', { action: 'different-action' }],
    ['non-production environment', { environment: 'staging' }],
    ['wrong signal', { signalHash: hashSignal('different-contributor') }],
    ['non-selfie legacy credential', { identifier: 'orb' }],
  ]

  it.each(invalidSelfieResults)('rejects a Selfie Check result with %s', async (_label, override) => {
    const idkitResult = {
      protocol_version: '3.0',
      nonce: `0x${'22'.repeat(32)}`,
      action: override.action ?? 'pollen-verify',
      responses: [{
        identifier: override.identifier ?? 'selfie',
        signal_hash: override.signalHash ?? hashSignal('brian-primary'),
        proof: `0x${'33'.repeat(256)}`,
        merkle_root: `0x${'55'.repeat(32)}`,
        nullifier: `0x${'44'.repeat(32)}`,
      }],
      user_presence_completed: true,
      environment: override.environment ?? 'production',
    }
    const fetchMock = vi.fn()
    const bindNullifier = vi.fn()
    const request = new Request('https://worker.test/api/v1/worldid/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contributor_id: 'brian-primary', idkit_result: idkitResult }),
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
})
