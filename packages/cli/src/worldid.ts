/**
 * World ID bridge protocol — pure Node.js implementation.
 *
 * Flow:
 *  1. Generate AES-256-GCM key
 *  2. Encrypt verification request
 *  3. POST to bridge → get request_id
 *  4. Show QR / URL for World App scanning
 *  5. Poll bridge for encrypted proof
 *  6. Decrypt and return proof
 */
import { webcrypto } from 'node:crypto'

const BRIDGE_URL = 'https://bridge.worldcoin.org'

// World ID app registration — public values, not secrets.
// Production app id comes from WORLD_ID_APP_ID; the staging id remains the
// dev fallback (staging proofs will fail server-side verification, which is
// the correct behavior — no more client-side bypass).
export const APP_ID = process.env.WORLD_ID_APP_ID ?? 'app_staging_d14d23238b2b9db320070f80948dc6a8'
export const ACTION = process.env.WORLD_ID_ACTION ?? 'pollen-verify'

// Base URL of the pollen site, which owns server-side proof verification
const POLLEN_API_URL = process.env.POLLEN_API_URL ?? 'https://www.pollen.id'

export interface WorldIdProof {
  nullifier_hash: string
  merkle_root: string
  proof: string
  verification_level: string
}

// --- Crypto helpers ---

async function generateKey(): Promise<{ key: CryptoKey; iv: Uint8Array }> {
  const crypto = webcrypto as unknown as Crypto
  return {
    iv: crypto.getRandomValues(new Uint8Array(12)),
    key: await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'],
    ),
  }
}

async function exportKeyBase64(key: CryptoKey): Promise<string> {
  const crypto = webcrypto as unknown as Crypto
  const raw = await crypto.subtle.exportKey('raw', key)
  return Buffer.from(raw).toString('base64')
}

async function encrypt(key: CryptoKey, iv: Uint8Array, plaintext: string): Promise<{ iv: string; payload: string }> {
  const crypto = webcrypto as unknown as Crypto
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as unknown as ArrayBuffer }, key, encoded)
  return {
    iv: Buffer.from(iv).toString('base64'),
    payload: Buffer.from(ciphertext).toString('base64'),
  }
}

async function decrypt(key: CryptoKey, ivB64: string, payloadB64: string): Promise<string> {
  const crypto = webcrypto as unknown as Crypto
  const iv = Buffer.from(ivB64, 'base64')
  const ciphertext = Buffer.from(payloadB64, 'base64')
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(plaintext)
}

// --- Bridge protocol ---

interface BridgeSession {
  requestId: string
  connectorURI: string   // QR code content — user scans this
  key: CryptoKey         // for decrypting the response
}

export async function createBridgeSession(): Promise<BridgeSession> {
  const { key, iv } = await generateKey()
  const keyB64 = await exportKeyBase64(key)

  // Encrypt the verification request
  const request = JSON.stringify({
    app_id: APP_ID,
    action: ACTION,
    signal: '',
    credential_types: ['device'],
    verification_level: 'device',
  })

  const encrypted = await encrypt(key, iv, request)

  // POST to bridge
  const res = await fetch(`${BRIDGE_URL}/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encrypted),
  })

  if (!res.ok) {
    throw new Error(`Bridge request failed: ${res.status} ${await res.text()}`)
  }

  const { request_id } = await res.json() as { request_id: string }

  // Construct the connector URI (what gets shown as QR)
  const connectorURI = `https://worldcoin.org/verify?t=wld&i=${request_id}&k=${encodeURIComponent(keyB64)}`

  return { requestId: request_id, connectorURI, key }
}

interface BridgeResponse {
  status: 'initialized' | 'retrieved' | 'completed'
  response: { iv: string; payload: string } | null
}

export async function pollForProof(
  session: BridgeSession,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<WorldIdProof> {
  const timeout = opts.timeoutMs ?? 120_000 // 2 minutes
  const interval = opts.intervalMs ?? 3_000  // 3 seconds
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const res = await fetch(`${BRIDGE_URL}/response/${session.requestId}`)
    if (!res.ok) {
      throw new Error(`Bridge poll failed: ${res.status}`)
    }

    const data = await res.json() as BridgeResponse

    if (data.status === 'completed' && data.response) {
      // Decrypt the proof
      const plaintext = await decrypt(
        session.key, data.response.iv, data.response.payload,
      )
      const parsed = JSON.parse(plaintext) as WorldIdProof | { error_code: string }

      if ('error_code' in parsed) {
        throw new Error(`World App error: ${parsed.error_code}`)
      }

      return parsed as WorldIdProof
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error('Verification timed out — user did not complete in World App')
}

// --- Server-side verification (via the pollen site) ---

export interface VerifyResponse {
  success: boolean
  nullifier?: string
  code?: string
  detail?: string
}

/**
 * Verify a World ID proof server-side.
 *
 * The proof is POSTed to the pollen site's verify route, which forwards it to
 * Worldcoin's cloud verifier and, on success, marks the contributor verified
 * in Neon. Verification is no longer skippable client-side — the site is the
 * single authority on who counts as a verified human.
 */
export async function verifyProof(proof: WorldIdProof, contributorId: string): Promise<VerifyResponse> {
  let res: Response
  try {
    res = await fetch(`${POLLEN_API_URL}/api/v1/worldid/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contributor_id: contributorId,
        proof: proof.proof,
        merkle_root: proof.merkle_root,
        nullifier_hash: proof.nullifier_hash,
        verification_level: proof.verification_level,
      }),
    })
  } catch (err) {
    return { success: false, code: 'network_error', detail: (err as Error).message }
  }

  let data: VerifyResponse
  try {
    data = await res.json() as VerifyResponse
  } catch {
    return { success: false, code: `http_${res.status}`, detail: 'Invalid response from verification server' }
  }

  if (!res.ok) {
    return { success: false, code: data.code ?? `http_${res.status}`, detail: data.detail }
  }
  return data
}
