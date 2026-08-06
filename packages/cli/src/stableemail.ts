/**
 * stableemail.dev x402 client — pay-per-send email, no API keys.
 *
 * Flow (x402 v1, scheme 'exact', network 'base'):
 *   1. POST unpaid → 402 with an `accepts` challenge
 *   2. Sign EIP-3009 transferWithAuthorization for the quoted USDC amount
 *   3. Retry with the base64 X-PAYMENT header → message id / receipt
 *
 * Signing key: POLLEN_X402_KEY, falling back to POLLEN_DEMO_KEY.
 */
import { signX402Payment, USDC_BASE } from './x402.js'

export const STABLEEMAIL_SEND_URL = 'https://stableemail.dev/api/send'

export type StableEmailErrorCode = 'no_key' | 'unfunded' | 'network' | 'bad_challenge' | 'http'

export class StableEmailError extends Error {
  constructor(public code: StableEmailErrorCode, message: string) {
    super(message)
    this.name = 'StableEmailError'
  }
}

export interface StableEmailMessage {
  to: string[]
  subject: string
  html: string
  text: string
}

export interface StableEmailReceipt {
  id: string | null
  paidUsd: string | null
  payer: string | null
  raw: unknown
}

interface X402Accept {
  scheme?: string
  network?: string
  payTo?: string
  maxAmountRequired?: string
  asset?: string
  extra?: { name?: string; version?: string }
}

export interface SendEmailOptions {
  /** Injectable for tests */
  fetchFn?: typeof fetch
  /** Overrides env key resolution (tests) */
  privateKey?: `0x${string}`
  url?: string
}

function resolveKey(opts: SendEmailOptions): `0x${string}` {
  const key = opts.privateKey ?? process.env.POLLEN_X402_KEY ?? process.env.POLLEN_DEMO_KEY
  if (!key) {
    throw new StableEmailError(
      'no_key',
      'No payment key configured. Sending costs $0.02 USDC on Base via x402 — set POLLEN_X402_KEY (or POLLEN_DEMO_KEY) to a funded wallet private key.',
    )
  }
  return key as `0x${string}`
}

async function postSend(
  fetchFn: typeof fetch, url: string, message: StableEmailMessage, paymentHeader?: string,
): Promise<Response> {
  try {
    return await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(paymentHeader ? { 'X-PAYMENT': paymentHeader } : {}),
      },
      body: JSON.stringify(message),
    })
  } catch (err) {
    throw new StableEmailError('network', `Could not reach stableemail.dev: ${(err as Error).message}`)
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try { return await res.json() } catch { return null }
}

function extractReceipt(raw: unknown, payer: string, paidUsd: string): StableEmailReceipt {
  const obj = (raw ?? {}) as Record<string, unknown>
  const id =
    (typeof obj.id === 'string' && obj.id) ||
    (typeof obj.messageId === 'string' && obj.messageId) ||
    (typeof obj.message_id === 'string' && obj.message_id) || null
  return { id, paidUsd, payer, raw }
}

/**
 * Send an email through stableemail.dev, paying $0.02 USDC on Base via x402.
 * Throws StableEmailError with a specific code on every failure path.
 */
export async function sendEmail(
  message: StableEmailMessage, opts: SendEmailOptions = {},
): Promise<StableEmailReceipt> {
  const fetchFn = opts.fetchFn ?? fetch
  const url = opts.url ?? STABLEEMAIL_SEND_URL

  // 1. Unpaid attempt — expect a 402 challenge (or a free pass).
  const first = await postSend(fetchFn, url, message)
  if (first.ok) {
    return extractReceipt(await safeJson(first), 'none', '0')
  }
  if (first.status !== 402) {
    const body = await first.text().catch(() => '')
    throw new StableEmailError('http', `stableemail.dev returned ${first.status}: ${body.slice(0, 300)}`)
  }

  // 2. Parse the challenge.
  const challenge = await safeJson(first) as { accepts?: X402Accept[] } | null
  const accept = challenge?.accepts?.find(a => a.scheme === 'exact' && a.network === 'base')
  if (!accept?.payTo || !accept.maxAmountRequired) {
    throw new StableEmailError('bad_challenge', 'stableemail.dev 402 challenge had no usable exact/base payment option.')
  }

  // 3. Sign the payment (key resolved only once we know payment is required).
  const key = resolveKey(opts)
  let amountUnits: bigint
  try {
    amountUnits = BigInt(accept.maxAmountRequired)
  } catch {
    throw new StableEmailError('bad_challenge', `Unparseable payment amount: ${accept.maxAmountRequired}`)
  }
  const { header, from } = await signX402Payment(key, {
    payTo: accept.payTo as `0x${string}`,
    amountUnits,
    network: 'base',
    asset: (accept.asset ?? USDC_BASE) as `0x${string}`,
    domainName: accept.extra?.name,
    domainVersion: accept.extra?.version,
  })

  // 4. Retry with X-PAYMENT.
  const second = await postSend(fetchFn, url, message, header)
  if (second.status === 402) {
    throw new StableEmailError(
      'unfunded',
      `Payment rejected — wallet ${from} likely has insufficient USDC on Base for $${(Number(amountUnits) / 1e6).toFixed(2)}.`,
    )
  }
  if (!second.ok) {
    const body = await second.text().catch(() => '')
    throw new StableEmailError('http', `stableemail.dev rejected the paid request (${second.status}): ${body.slice(0, 300)}`)
  }
  return extractReceipt(await safeJson(second), from, (Number(amountUnits) / 1e6).toFixed(2))
}
