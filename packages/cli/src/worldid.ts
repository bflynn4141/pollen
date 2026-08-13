/** World ID production flow for the CLI. */
import {
  CredentialRequest,
  IDKit,
  type IDKitRequest,
  type IDKitResult,
} from '@worldcoin/idkit-core'

export const APP_ID = process.env.WORLD_ID_APP_ID
  || 'app_a78733c7bfb32f86874803a9e9dd3ee3'
export const RP_ID = process.env.WORLD_ID_RP_ID
  || 'rp_6e4e8b15687b4d76'
export const ACTION = process.env.WORLD_ID_ACTION ?? 'pollen-verify-v6'

const POLLEN_API_URL = process.env.POLLEN_API_URL
  || 'https://pollen-api.bflynn4141.workers.dev'

// The Worker signs RP requests, while the Vercel route owns proof verification.
// Keep these independently configurable so a Worker routing/auth change cannot
// prevent a completed World ID proof from reaching the verifier.
const POLLEN_WORLD_ID_VERIFY_URL = process.env.POLLEN_WORLD_ID_VERIFY_URL
  || 'https://site-alpha-umber-69.vercel.app/api/v1/worldid/verify'

interface RpSignatureResponse {
  app_id: string
  rp_id: string
  action: string
  sig: string
  nonce: string
  created_at: number
  expires_at: number
}

export interface BridgeSession {
  requestId: string
  connectorURI: string
  request: IDKitRequest
}

export class WorldIdPollError extends Error {
  constructor(public readonly code: string) {
    super(`World App error: ${code}`)
    this.name = 'WorldIdPollError'
  }
}

function pollErrorCode(error: unknown): string {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
  ) {
    return error.code
  }
  return 'generic_error'
}

/** Turn IDKit poll failures into concise, actionable CLI copy. */
export function formatPollFailure(error: unknown): string {
  const code = pollErrorCode(error)
  switch (code) {
    case 'timeout':
    case 'rp_signature_expired':
      return 'The verification link expired after 5 minutes. Run `pollen verify` again for a fresh link.'
    case 'user_rejected':
      return 'You cancelled the request in World ID App. Run `pollen verify` when you are ready to try again.'
    case 'verification_rejected':
      return 'World ID App rejected this verification. Run `pollen verify` to try again.'
    case 'credential_unavailable':
    case 'world_id_4_not_available':
      return 'This World ID account does not have the Orb-backed Proof of Human credential required by Pollen.'
    default:
      return `World ID verification failed (${code}). Run \`pollen verify\` to try again.`
  }
}

/**
 * IDKit resolves its bundled WASM as a file: URL. Browsers can fetch that URL,
 * but Node's fetch intentionally cannot, so provide a narrowly scoped loader
 * while the SDK initializes.
 */
export async function fetchIdKitResource(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallback: typeof fetch,
): Promise<Response> {
  const url = input instanceof URL ? input : null
  if (url?.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises')
    return new Response(await readFile(url), {
      headers: { 'Content-Type': 'application/wasm' },
    })
  }
  return fallback(input, init)
}

async function initializeRequest(
  create: () => Promise<IDKitRequest>,
): Promise<IDKitRequest> {
  const originalFetch = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => (
    fetchIdKitResource(input, init, originalFetch)
  )) as typeof fetch

  try {
    return await create()
  } finally {
    globalThis.fetch = originalFetch
  }
}

export async function createBridgeSession(contributorId: string): Promise<BridgeSession> {
  if (!APP_ID || !RP_ID) {
    throw new Error('WORLD_ID_APP_ID and WORLD_ID_RP_ID are required for production verification')
  }

  const signatureResponse = await fetch(`${POLLEN_API_URL}/api/v1/worldid/rp-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!signatureResponse.ok) {
    throw new Error(`World ID signature request failed: ${signatureResponse.status}`)
  }

  const signature = await signatureResponse.json() as RpSignatureResponse
  if (
    signature.app_id !== APP_ID
    || signature.rp_id !== RP_ID
    || signature.action !== ACTION
    || !signature.sig
  ) {
    throw new Error('World ID signature response does not match the CLI configuration')
  }

  const request = await initializeRequest(() => IDKit.request({
    app_id: APP_ID as `app_${string}`,
    action: ACTION,
    rp_context: {
      rp_id: RP_ID,
      nonce: signature.nonce,
      created_at: signature.created_at,
      expires_at: signature.expires_at,
      signature: signature.sig,
    },
    // Pollen payouts require the strongest World ID assurance level. Legacy
    // v3 credentials (including Selfie Check) are intentionally excluded.
    allow_legacy_proofs: false,
    environment: 'production',
  }).constraints(CredentialRequest('proof_of_human', { signal: contributorId })),
  )

  return {
    requestId: request.requestId,
    connectorURI: request.connectorURI,
    request,
  }
}

export async function pollForProof(
  session: BridgeSession,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<IDKitResult> {
  const completion = await session.request.pollUntilCompletion({
    timeout: opts.timeoutMs ?? 300_000,
    pollInterval: opts.intervalMs ?? 2_000,
  })
  if (!completion.success) {
    throw new WorldIdPollError(completion.error)
  }
  return completion.result
}

export interface VerifyResponse {
  success: boolean
  nullifier?: string
  verification_level?: string
  code?: string
  detail?: string
}

export async function verifyProof(
  result: IDKitResult,
  contributorId: string,
): Promise<VerifyResponse> {
  let response: Response
  try {
    response = await fetch(POLLEN_WORLD_ID_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contributor_id: contributorId, idkit_result: result }),
    })
  } catch (error) {
    return { success: false, code: 'network_error', detail: (error as Error).message }
  }

  let data: VerifyResponse
  try {
    data = await response.json() as VerifyResponse
  } catch {
    return {
      success: false,
      code: `http_${response.status}`,
      detail: 'Invalid response from verification server',
    }
  }
  if (!response.ok) {
    return {
      success: false,
      code: data.code ?? `http_${response.status}`,
      detail: data.detail,
    }
  }
  return data
}
