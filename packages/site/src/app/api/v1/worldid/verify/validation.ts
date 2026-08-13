import { hashSignal } from '@worldcoin/idkit-core'

export type IdKitResult = {
  protocol_version: '4.0'
  nonce: string
  action: string
  environment: 'production'
  responses: Array<{
    identifier: 'proof_of_human' | 'orb'
    issuer_schema_id: 1
    signal_hash: string
    proof: unknown
    nullifier: string
  }>
  user_presence_completed?: boolean
}

export type IdKitValidationStage =
  | 'protocol'
  | 'action'
  | 'environment'
  | 'response_count'
  | 'identifier'
  | 'issuer_schema'
  | 'signal'
  | 'nullifier'
  | 'proof'

export type IdKitValidationResult =
  | { ok: true; value: IdKitResult }
  | { ok: false; stage: IdKitValidationStage }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFieldHexInteger(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{1,64}$/.test(value)
}

function equalHexIntegers(left: unknown, right: string): boolean {
  return isFieldHexInteger(left) && BigInt(left) === BigInt(right)
}

export function validateIdKitResult(
  value: unknown,
  expectedAction: string,
  contributorId: string,
): IdKitValidationResult {
  // The nonce belongs to the signed protocol envelope. Diagnose only the
  // stage, never the field value itself.
  if (
    !isRecord(value)
    || value.protocol_version !== '4.0'
    || typeof value.nonce !== 'string'
    || value.nonce.length === 0
  ) return { ok: false, stage: 'protocol' }
  if (value.action !== expectedAction) return { ok: false, stage: 'action' }
  if (value.environment !== 'production') return { ok: false, stage: 'environment' }
  if (!Array.isArray(value.responses) || value.responses.length !== 1) {
    return { ok: false, stage: 'response_count' }
  }

  const [response] = value.responses
  if (
    !isRecord(response)
    || (response.identifier !== 'proof_of_human' && response.identifier !== 'orb')
  ) {
    return { ok: false, stage: 'identifier' }
  }
  if (response.issuer_schema_id !== 1) return { ok: false, stage: 'issuer_schema' }
  if (!equalHexIntegers(response.signal_hash, hashSignal(contributorId))) {
    return { ok: false, stage: 'signal' }
  }
  if (!isFieldHexInteger(response.nullifier)) return { ok: false, stage: 'nullifier' }
  // World owns the proof encoding and is the sole cryptographic verifier.
  // Pollen only requires the envelope field and forwards it unchanged.
  if (!Object.prototype.hasOwnProperty.call(response, 'proof')) {
    return { ok: false, stage: 'proof' }
  }

  return { ok: true, value: value as IdKitResult }
}
