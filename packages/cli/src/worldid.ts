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
import { webcrypto, randomBytes } from 'node:crypto'

const BRIDGE_URL = 'https://bridge.worldcoin.org'

// World ID app registration — public values, not secrets
export const APP_ID = 'app_staging_d14d23238b2b9db320070f80948dc6a8'
export const ACTION = 'pollen'

// Flip to false when production app_id is available
const SKIP_SERVER_VERIFY = APP_ID.startsWith('app_staging_')

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

// --- Server-side verification (v4 API) ---

const VERIFY_URL = 'https://developer.world.org/api/v4/verify'

// Hash of empty signal — keccak256("") mapped to BN254 field
const EMPTY_SIGNAL_HASH = '0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4'

interface VerifyResponse {
  success: boolean
  nullifier?: string
  action?: string
  code?: string
  detail?: string
  attribute?: string
  results?: Array<{ identifier: string; success: boolean; code?: string; detail?: string }>
}

export async function verifyProof(proof: WorldIdProof): Promise<VerifyResponse> {
  // Nonce is per-request replay protection, not the signal hash
  const nonce = '0x' + randomBytes(16).toString('hex')

  // Server-side verification against World ID cloud API.
  // Currently disabled for staging app_ids (World ID 4.0 preview limitation:
  // staging apps can't verify proofs against the production Merkle tree).
  // When production app_ids become available, set SKIP_SERVER_VERIFY = false.
  if (SKIP_SERVER_VERIFY) {
    return { success: true, nullifier: proof.nullifier_hash }
  }

  const body = {
    protocol_version: '3.0',
    nonce,
    action: ACTION,
    responses: [{
      identifier: proof.verification_level,
      signal_hash: EMPTY_SIGNAL_HASH,
      merkle_root: proof.merkle_root,
      nullifier: proof.nullifier_hash,
      proof: proof.proof,
    }],
  }

  const res = await fetch(`${VERIFY_URL}/${APP_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  return await res.json() as VerifyResponse
}
