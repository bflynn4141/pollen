/** World ID 4 production flow for the CLI. */
import {
  IDKit,
  proofOfHuman,
  type IDKitRequest,
  type IDKitResult,
} from '@worldcoin/idkit-core'

export const APP_ID = process.env.WORLD_ID_APP_ID
export const RP_ID = process.env.WORLD_ID_RP_ID
export const ACTION = process.env.WORLD_ID_ACTION ?? 'pollen-verify-v2'

const POLLEN_API_URL = process.env.POLLEN_API_URL
  ?? 'https://site-alpha-umber-69.vercel.app'

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

async function initializeRequest(create: () => Promise<IDKitRequest>): Promise<IDKitRequest> {
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
      // This is a new production app, so accepting legacy proofs would only
      // create a second nullifier path for the same person.
      allow_legacy_proofs: false,
      environment: 'production',
    }).preset(proofOfHuman({ signal: contributorId })),
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
    timeout: opts.timeoutMs ?? 600_000,
    pollInterval: opts.intervalMs ?? 2_000,
  })
  if (!completion.success) {
    throw new Error(`World App error: ${completion.error}`)
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
    response = await fetch(`${POLLEN_API_URL}/api/v1/worldid/verify`, {
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
