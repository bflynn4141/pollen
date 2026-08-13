import { describe, expect, it } from 'vitest'
import { hashSignal } from '@worldcoin/idkit-core'
import { validateIdKitResult } from './validation'

const contributorId = 'brian-primary'
const privateValues = {
  nonce: `0x${'a1'.repeat(32)}`,
  nullifier: `0x${'b2'.repeat(32)}`,
  signal: `0x${'c3'.repeat(32)}`,
  proof: `0x${'d4'.repeat(32)}`,
  signature: `0x${'e5'.repeat(65)}`,
}

const validResult = {
  protocol_version: '4.0',
  nonce: privateValues.nonce,
  action: 'pollen-verify',
  environment: 'production',
  responses: [{
    identifier: 'proof_of_human',
    signal_hash: hashSignal(contributorId),
    proof: ['0x01', '0x02', '0x03', '0x04', '0x05'],
    nullifier: privateValues.nullifier,
    issuer_schema_id: 1,
  }],
  signature: privateValues.signature,
}

const failures = [
  ['protocol', { ...validResult, protocol_version: '3.0' }],
  ['action', { ...validResult, action: 'different-action' }],
  ['environment', { ...validResult, environment: 'staging' }],
  ['response_count', { ...validResult, responses: [] }],
  ['identifier', {
    ...validResult,
    responses: [{ ...validResult.responses[0], identifier: 'selfie' }],
  }],
  ['issuer_schema', {
    ...validResult,
    responses: [{ ...validResult.responses[0], issuer_schema_id: 11 }],
  }],
  ['signal', {
    ...validResult,
    responses: [{ ...validResult.responses[0], signal_hash: privateValues.signal }],
  }],
  ['nullifier', {
    ...validResult,
    responses: [{ ...validResult.responses[0], nullifier: 'not-hex' }],
  }],
  ['proof', {
    ...validResult,
    responses: [{
      identifier: validResult.responses[0].identifier,
      signal_hash: validResult.responses[0].signal_hash,
      nullifier: validResult.responses[0].nullifier,
      issuer_schema_id: validResult.responses[0].issuer_schema_id,
    }],
  }],
] as const

describe('World ID site validation diagnostics', () => {
  it.each(failures)('reports only the %s stage', (stage, idkitResult) => {
    const result = validateIdKitResult(idkitResult, 'pollen-verify', contributorId)

    expect(result).toEqual({ ok: false, stage })
    const serialized = JSON.stringify(result)
    for (const privateValue of Object.values(privateValues)) {
      expect(serialized).not.toContain(privateValue)
    }
  })

  it('accepts the live schema-1 orb identifier without rewriting the payload', () => {
    const orbResult = {
      ...validResult,
      responses: [{ ...validResult.responses[0], identifier: 'orb' }],
    }

    expect(validateIdKitResult(orbResult, 'pollen-verify', contributorId)).toEqual({
      ok: true,
      value: orbResult,
    })
  })

  it.each([
    ['encoded proof string', `0x${'33'.repeat(256)}`],
    ['proof array', ['0x01', '0x02']],
    ['opaque proof object', { protocol_owned_encoding: true }],
    ['null proof value', null],
    ['empty proof string', ''],
    ['empty proof array', []],
  ])('leaves a present %s to the World verifier', (_label, proof) => {
    const idkitResult = {
      ...validResult,
      responses: [{ ...validResult.responses[0], proof }],
    }

    expect(validateIdKitResult(idkitResult, 'pollen-verify', contributorId)).toEqual({
      ok: true,
      value: idkitResult,
    })
  })

  it.each([
    ['oversized nullifier', { nullifier: `0x${'1'.repeat(65)}` }],
  ])('rejects %s', (_label, override) => {
    const result = validateIdKitResult({
      ...validResult,
      responses: [{ ...validResult.responses[0], ...override }],
    }, 'pollen-verify', contributorId)

    expect(result).toEqual({ ok: false, stage: override.nullifier ? 'nullifier' : 'proof' })
  })
})
