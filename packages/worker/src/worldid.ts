import { neon } from '@neondatabase/serverless'
import { signRequest, type RpSignature, type SignRequestParams } from '@worldcoin/idkit-core/signing'
import { hashSignal } from '@worldcoin/idkit-core/hashing'

export interface WorldIdEnv {
  WORLD_ID_APP_ID: string
  WORLD_ID_RP_ID: string
  WORLD_ID_ACTION: string
  RP_SIGNING_KEY: string
  NEON_DATABASE_URL: string
}

type Signer = (params: SignRequestParams) => RpSignature

export interface RpSignatureResponse {
  app_id: string
  rp_id: string
  action: string
  sig: string
  nonce: string
  created_at: number
  expires_at: number
}

export type BindResult =
  | { ok: true }
  | { ok: false; code: 'nullifier_already_bound' | 'contributor_already_bound' }

type VerifyDependencies = {
  fetch?: typeof fetch
  bindNullifier?: typeof bindWorldIdNullifier
}

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
}

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function hasWorldIdConfig(env: WorldIdEnv): boolean {
  return Boolean(
    env.WORLD_ID_APP_ID
      && env.WORLD_ID_RP_ID
      && env.WORLD_ID_ACTION
      && env.RP_SIGNING_KEY
      && env.NEON_DATABASE_URL,
  )
}

export function issueRpSignature(env: WorldIdEnv, signer: Signer = signRequest): RpSignatureResponse {
  if (!hasWorldIdConfig(env)) throw new Error('World ID is not configured')

  const signature = signer({ signingKeyHex: env.RP_SIGNING_KEY, action: env.WORLD_ID_ACTION })
  return {
    app_id: env.WORLD_ID_APP_ID,
    rp_id: env.WORLD_ID_RP_ID,
    action: env.WORLD_ID_ACTION,
    sig: signature.sig,
    nonce: signature.nonce,
    created_at: signature.createdAt,
    expires_at: signature.expiresAt,
  }
}

export function handleRpSignature(env: WorldIdEnv): Response {
  try {
    return json(issueRpSignature(env))
  } catch {
    // Never expose signing configuration or key parsing details.
    return json({ success: false, code: 'not_configured', detail: 'World ID is not configured' }, 500)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFieldHexInteger(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{1,64}$/.test(value)
}

function equalHexIntegers(left: unknown, right: string): boolean {
  return isFieldHexInteger(left) && BigInt(left) === BigInt(right)
}

function canonicalHexInteger(value: string): string {
  return `0x${BigInt(value).toString(16)}`
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

type ValidIdKitResult = Record<string, unknown> & {
  responses: Array<{
    identifier: 'proof_of_human' | 'orb'
    issuer_schema_id: 1
    nullifier: string
    proof: unknown
    [key: string]: unknown
  }>
}

type IdKitValidationResult =
  | { ok: true; value: ValidIdKitResult }
  | { ok: false; stage: IdKitValidationStage }

export function validateIdKitResult(
  value: unknown,
  expectedAction: string,
  contributorId: string,
): IdKitValidationResult {
  // A nonce is part of the signed protocol envelope. Group its structural
  // check under the protocol stage so diagnostics never echo the nonce.
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

  const expectedSignalHash = hashSignal(contributorId).toLowerCase()
  const [response] = value.responses
  if (
    !isRecord(response)
    || (response.identifier !== 'proof_of_human' && response.identifier !== 'orb')
  ) {
    return { ok: false, stage: 'identifier' }
  }
  if (response.issuer_schema_id !== 1) return { ok: false, stage: 'issuer_schema' }
  if (!equalHexIntegers(response.signal_hash, expectedSignalHash)) {
    return { ok: false, stage: 'signal' }
  }
  if (!isFieldHexInteger(response.nullifier)) return { ok: false, stage: 'nullifier' }
  // The proof encoding is owned by the World ID protocol and can evolve
  // independently of Pollen. Require the envelope field, but forward its
  // value unchanged and leave serialization and cryptography to World.
  if (!Object.prototype.hasOwnProperty.call(response, 'proof')) {
    return { ok: false, stage: 'proof' }
  }

  return { ok: true, value: value as ValidIdKitResult }
}

function isContributorId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
}

interface WorldVerifyResponse {
  success?: boolean
  nullifier?: string
  code?: string
  detail?: string
  message?: string
  results?: Array<{
    identifier?: string
    success?: boolean
    nullifier?: string
  }>
}

export async function bindWorldIdNullifier(
  databaseUrl: string,
  contributorId: string,
  nullifier: string,
  verificationLevel: string,
): Promise<BindResult> {
  const sql = neon(databaseUrl)

  try {
    const rows = await sql`
      INSERT INTO contributors (
        contributor_id, world_id_nullifier, verification_level, verified_at, updated_at
      )
      VALUES (${contributorId}, ${nullifier}, ${verificationLevel}, NOW(), NOW())
      ON CONFLICT (contributor_id) DO UPDATE SET
        world_id_nullifier = EXCLUDED.world_id_nullifier,
        verification_level = EXCLUDED.verification_level,
        verified_at = EXCLUDED.verified_at,
        updated_at = NOW()
      WHERE contributors.world_id_nullifier IS NULL
         OR contributors.world_id_nullifier = EXCLUDED.world_id_nullifier
      RETURNING contributor_id
    `

    if (rows.length === 0) return { ok: false, code: 'contributor_already_bound' }
    return { ok: true }
  } catch (error) {
    const dbError = error as Error & { code?: string; constraint?: string }
    if (
      dbError.code === '23505'
      || dbError.constraint?.includes('world_id_nullifier')
      || dbError.message.includes('world_id_nullifier')
      || dbError.message.includes('duplicate key')
    ) {
      return { ok: false, code: 'nullifier_already_bound' }
    }
    throw error
  }
}

export async function handleWorldIdVerify(
  request: Request,
  env: WorldIdEnv,
  dependencies: VerifyDependencies = {},
): Promise<Response> {
  if (!hasWorldIdConfig(env)) {
    return json({ success: false, code: 'not_configured', detail: 'World ID is not configured' }, 500)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ success: false, code: 'invalid_json' }, 400)
  }

  if (!isRecord(body) || !isContributorId(body.contributor_id)) {
    return json({ success: false, code: 'invalid_contributor_id' }, 400)
  }
  const idkitValidation = validateIdKitResult(
    body.idkit_result,
    env.WORLD_ID_ACTION,
    body.contributor_id,
  )
  if (!idkitValidation.ok) {
    return json({
      success: false,
      code: 'invalid_idkit_result',
      detail: `IDKit result failed validation at ${idkitValidation.stage}`,
    }, 400)
  }
  const idkitResult = idkitValidation.value

  const fetchImpl = dependencies.fetch ?? fetch
  let verifierResponse: Response
  try {
    verifierResponse = await fetchImpl(
      `https://developer.world.org/api/v4/verify/${encodeURIComponent(env.WORLD_ID_RP_ID)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // The Developer Portal requires the IDKit result without field remapping.
        body: JSON.stringify(idkitResult),
      },
    )
  } catch {
    return json({ success: false, code: 'verification_unavailable' }, 502)
  }

  const verifierContentType = verifierResponse.headers.get('content-type') ?? 'missing'
  const verifierBody = await verifierResponse.text()
  let verified: WorldVerifyResponse
  try {
    verified = JSON.parse(verifierBody) as WorldVerifyResponse
  } catch {
    const bodyKind = verifierBody.trimStart().startsWith('<') ? 'html' : 'non-json'
    return json({
      success: false,
      code: 'invalid_verifier_response',
      detail: `status=${verifierResponse.status}; content-type=${verifierContentType}; bytes=${verifierBody.length}; kind=${bodyKind}`,
    }, 502)
  }

  if (!verifierResponse.ok || verified.success !== true) {
    return json({
      success: false,
      code: verified.code ?? 'verification_failed',
      detail: verified.detail ?? verified.message ?? `World ID verifier returned ${verifierResponse.status}`,
    }, 400)
  }

  // World has now cryptographically verified the payload as-is. Read identity
  // fields from that verified payload rather than relying on optional duplicate
  // fields in the verifier's response envelope.
  const [verifiedCredential] = idkitResult.responses
  const nullifier = canonicalHexInteger(verifiedCredential.nullifier)
  const verificationLevel = 'proof_of_human'

  const bind = dependencies.bindNullifier ?? bindWorldIdNullifier
  let binding: BindResult
  try {
    binding = await bind(
      env.NEON_DATABASE_URL,
      body.contributor_id,
      nullifier,
      verificationLevel,
    )
  } catch {
    return json({ success: false, code: 'database_error' }, 500)
  }

  if (!binding.ok) {
    const detail = binding.code === 'nullifier_already_bound'
      ? 'This World ID is already linked to a different contributor'
      : 'This contributor is already linked to a different World ID'
    return json({ success: false, code: binding.code, detail }, 409)
  }

  return json({ success: true, nullifier, verification_level: verificationLevel })
}
