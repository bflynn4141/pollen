import type { MiddlewareHandler } from 'hono'
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http'
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from '@x402/core/types'
import { toFacilitatorEvmSigner } from '@x402/evm'
import { ExactEvmScheme } from '@x402/evm/exact/facilitator'
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseSignature,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { paidResource, type PaidResourcePath } from './buyer-catalog'

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const BASE_NETWORK = 'eip155:8453' as const
const DEFAULT_BASE_RPC = 'https://mainnet.base.org'

export interface X402RelayEnv {
  X402_PAY_TO?: string
  X402_RELAYER_KEY?: string
  BASE_RPC_URL?: string
  POLLEN_TOKEN_ADDRESS?: string
  X402_RELAYER?: DurableObjectNamespace
}

interface ExactPaymentPayload extends PaymentPayload {
  x402Version: 2
  accepted: PaymentRequirements & {
    scheme: 'exact'
    network: typeof BASE_NETWORK
  }
  payload: {
    signature: Hex
    authorization: {
      from: `0x${string}`
      to: `0x${string}`
      value: string
      validAfter: string
      validBefore: string
      nonce: Hex
    }
  }
}

export interface PaymentRelayer {
  verify(env: X402RelayEnv, payment: ExactPaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse>
  settle(env: X402RelayEnv, payment: ExactPaymentPayload): Promise<SettleResponse>
  release?(env: X402RelayEnv, payment: ExactPaymentPayload): Promise<void>
}

function requirementsFor(route: PaidResourcePath, payTo: string): PaymentRequirements {
  const definition = paidResource(route)!.resource
  return {
    scheme: 'exact',
    network: BASE_NETWORK,
    amount: definition.amount,
    payTo: getAddress(payTo),
    maxTimeoutSeconds: 60,
    asset: BASE_USDC,
    extra: { name: 'USD Coin', version: '2' },
  }
}

function paymentRequiredFor(
  url: string,
  route: PaidResourcePath,
  requirements: PaymentRequirements,
  error: string,
): PaymentRequired {
  return {
    x402Version: 2,
    error,
    resource: {
      url,
      description: paidResource(route)!.resource.description,
      mimeType: 'application/json',
      serviceName: 'Pollen Prompt Intelligence',
      tags: ['ai', 'developer-tools', 'prompt-intelligence', 'privacy-safe'],
    },
    accepts: [requirements],
    extensions: {},
  }
}

function clients(env: X402RelayEnv) {
  const rpc = env.BASE_RPC_URL || DEFAULT_BASE_RPC
  const publicClient = createPublicClient({ chain: base, transport: http(rpc) })
  if (!env.X402_RELAYER_KEY?.startsWith('0x')) throw new Error('missing X402_RELAYER_KEY')
  const account = privateKeyToAccount(env.X402_RELAYER_KEY as Hex)
  const walletClient = createWalletClient({ account, chain: base, transport: http(rpc) })
  return { publicClient, walletClient }
}

function facilitatorScheme(env: X402RelayEnv): ExactEvmScheme {
  const { publicClient, walletClient } = clients(env)
  const signer = toFacilitatorEvmSigner({
    address: walletClient.account.address,
    readContract: args => publicClient.readContract(args as never),
    verifyTypedData: args => publicClient.verifyTypedData(args as never),
    writeContract: args => walletClient.writeContract(args as never),
    sendTransaction: args => walletClient.sendTransaction(args as never),
    waitForTransactionReceipt: args => publicClient.waitForTransactionReceipt(args),
    getCode: args => publicClient.getCode(args),
  })
  return new ExactEvmScheme(signer)
}

export async function getRelayerHealth(env: X402RelayEnv): Promise<{
  address: string
  balance_wei: string
  healthy: boolean
}> {
  const { publicClient, walletClient } = clients(env)
  const address = walletClient.account.address
  const balance = await publicClient.getBalance({ address })
  return {
    address,
    balance_wei: balance.toString(),
    // Keep enough headroom for several Base settlement transactions.
    healthy: balance >= 500_000_000_000_000n,
  }
}

async function durableRequest<T>(
  env: X402RelayEnv,
  action: 'reserve' | 'settle' | 'release',
  payment: ExactPaymentPayload,
  requirements?: PaymentRequirements,
): Promise<T> {
  if (!env.X402_RELAYER) throw new Error('missing X402_RELAYER binding')
  const payer = payment.payload.authorization.from.toLowerCase()
  const id = env.X402_RELAYER.idFromName(`payer:${payer}`)
  const response = await env.X402_RELAYER.get(id).fetch('https://relayer.internal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payment, requirements }),
  })
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error || `relayer ${action} failed`)
  return body
}

const baseRelayer: PaymentRelayer = {
  verify: (env, payment, requirements) => durableRequest(env, 'reserve', payment, requirements),
  settle: (env, payment) => durableRequest(env, 'settle', payment),
  release: async (env, payment) => { await durableRequest(env, 'release', payment) },
}

const settlementAbi = [
  { type: 'function', name: 'usdc', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'pollenToken', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  {
    type: 'function',
    name: 'settle',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
] as const

const usdcAbi = [
  {
    type: 'function',
    name: 'authorizationState',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

interface Reservation {
  payment: ExactPaymentPayload
  requirements: PaymentRequirements
  createdAt: number
}

interface PayerReservation {
  key: string
  amount: string
  createdAt: number
}

function reservationKey(payment: ExactPaymentPayload): string {
  const { from, nonce } = payment.payload.authorization
  return `reservation:${from.toLowerCase()}:${nonce.toLowerCase()}`
}

function reservedKey(payment: ExactPaymentPayload): string {
  return `reserved:${payment.payload.authorization.from.toLowerCase()}`
}

/**
 * Payer-scoped Durable Objects reserve EIP-3009 nonces before protected query
 * work. Verified payments are then delegated to one global broadcast object,
 * which prevents local-account nonce races across Worker isolates without
 * letting an invalid payer block everyone else's verification.
 */
export class X402SettlementRelayer {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: X402RelayEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    return this.state.blockConcurrencyWhile(async () => {
      try {
        const body = await request.json() as {
          action: 'reserve' | 'settle' | 'release' | 'broadcast'
          payment: ExactPaymentPayload
          requirements?: PaymentRequirements
          reservation?: Reservation
        }
        if (body.action === 'reserve') {
          if (!body.requirements) throw new Error('missing payment requirements')
          return Response.json(await this.reserve(body.payment, body.requirements))
        }
        if (body.action === 'settle') return Response.json(await this.settle(body.payment))
        if (body.action === 'broadcast') {
          if (!body.reservation) throw new Error('missing reservation')
          return Response.json(await this.broadcast(body.reservation))
        }
        if (body.action === 'release') {
          await this.release(body.payment)
          return Response.json({ ok: true })
        }
        return Response.json({ error: 'unknown relayer action' }, { status: 400 })
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : 'relayer failed' },
          { status: 500 },
        )
      }
    })
  }

  private async reserve(
    payment: ExactPaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    const { publicClient } = clients(this.env)
    const settlement = getAddress(requirements.payTo)
    const payer = getAddress(payment.payload.authorization.from)
    const nonce = payment.payload.authorization.nonce

    const code = await publicClient.getCode({ address: settlement })
    if (!code || code === '0x') throw new Error('X402_PAY_TO has no contract code')
    if (!this.env.POLLEN_TOKEN_ADDRESS) throw new Error('missing POLLEN_TOKEN_ADDRESS')

    const [configuredUsdc, configuredToken, alreadyUsed] = await Promise.all([
      publicClient.readContract({ address: settlement, abi: settlementAbi, functionName: 'usdc' }),
      publicClient.readContract({ address: settlement, abi: settlementAbi, functionName: 'pollenToken' }),
      publicClient.readContract({
        address: BASE_USDC,
        abi: usdcAbi,
        functionName: 'authorizationState',
        args: [payer, nonce],
      }),
    ])
    if (getAddress(configuredUsdc) !== getAddress(BASE_USDC)) throw new Error('settlement USDC mismatch')
    if (getAddress(configuredToken) !== getAddress(this.env.POLLEN_TOKEN_ADDRESS)) {
      throw new Error('settlement token mismatch')
    }
    if (alreadyUsed) return { isValid: false, invalidReason: 'duplicate_settlement', payer }

    const key = reservationKey(payment)
    const existing = await this.state.storage.get<Reservation>(key)
    if (existing && Date.now() - existing.createdAt <= 300_000) {
      return { isValid: false, invalidReason: 'duplicate_settlement', payer }
    }
    if (existing) await this.release(existing.payment)

    const payerKey = reservedKey(payment)
    const payerLock = await this.state.storage.get<PayerReservation>(payerKey)
    if (payerLock && Date.now() - payerLock.createdAt <= 300_000) {
      return { isValid: false, invalidReason: 'invalid_payment', payer }
    }
    if (payerLock) await this.state.storage.delete([payerLock.key, payerKey])

    const verification = await facilitatorScheme(this.env).verify(payment, requirements)
    if (!verification.isValid) return verification

    const amount = BigInt(payment.payload.authorization.value)
    const balance = await publicClient.readContract({
      address: BASE_USDC,
      abi: usdcAbi,
      functionName: 'balanceOf',
      args: [payer],
    })
    if (balance < amount) {
      return { isValid: false, invalidReason: 'insufficient_funds', payer }
    }

    const createdAt = Date.now()
    await this.state.storage.put({
      [key]: { payment, requirements, createdAt } satisfies Reservation,
      [payerKey]: { key, amount: String(amount), createdAt } satisfies PayerReservation,
    })
    return verification
  }

  private async settle(payment: ExactPaymentPayload): Promise<SettleResponse> {
    const key = reservationKey(payment)
    const reservation = await this.state.storage.get<Reservation>(key)
    if (!reservation) throw new Error('payment is not reserved')

    if (!this.env.X402_RELAYER) throw new Error('missing X402_RELAYER binding')
    const broadcaster = this.env.X402_RELAYER.get(
      this.env.X402_RELAYER.idFromName('base-mainnet:broadcaster'),
    )
    const response = await broadcaster.fetch('https://relayer.internal/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'broadcast', payment, reservation }),
    })
    const result = await response.json() as SettleResponse & { error?: string }
    if (!response.ok) throw new Error(result.error || 'settlement broadcast failed')
    await this.release(reservation.payment)
    return result
  }

  private async broadcast(reservation: Reservation): Promise<SettleResponse> {
    const { publicClient, walletClient } = clients(this.env)
    const { authorization, signature } = reservation.payment.payload
    const parsed = parseSignature(signature)
    const v = Number(parsed.yParity) + 27
    const transaction = await walletClient.writeContract({
      address: getAddress(reservation.requirements.payTo),
      abi: settlementAbi,
      functionName: 'settle',
      args: [
        getAddress(authorization.from),
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce,
        v,
        parsed.r,
        parsed.s,
      ],
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transaction })
    if (receipt.status !== 'success') throw new Error('settlement transaction reverted')
    return { success: true, payer: authorization.from, transaction, network: BASE_NETWORK }
  }

  private async release(payment: ExactPaymentPayload): Promise<void> {
    const payerKey = reservedKey(payment)
    const key = reservationKey(payment)
    const lock = await this.state.storage.get<PayerReservation>(payerKey)
    await this.state.storage.delete(key)
    if (!lock || lock.key === key) await this.state.storage.delete(payerKey)
  }
}

export function createPollenPaymentMiddleware(
  relayer: PaymentRelayer = baseRelayer,
): MiddlewareHandler<{ Bindings: X402RelayEnv }> {
  return async (c, next) => {
    const paid = paidResource(c.req.path)
    if (!paid) return next()
    const route = paid.path

    if (!c.env.X402_PAY_TO || !c.env.X402_RELAYER_KEY) {
      return c.json({ error: 'x402 settlement is not configured' }, 503)
    }

    let requirements: PaymentRequirements
    try {
      requirements = requirementsFor(route, c.env.X402_PAY_TO)
    } catch {
      return c.json({ error: 'x402 settlement is not configured' }, 503)
    }

    const paymentRequired = (error: string) => {
      const challenge = paymentRequiredFor(c.req.url, route, requirements, error)
      c.header('PAYMENT-REQUIRED', encodePaymentRequiredHeader(challenge))
      c.header('Cache-Control', 'no-store')
      return c.json(challenge, 402)
    }

    const header = c.req.header('PAYMENT-SIGNATURE')
    if (!header) {
      return paymentRequired('PAYMENT-SIGNATURE header is required')
    }

    let payment: ExactPaymentPayload
    try {
      const decoded = decodePaymentSignatureHeader(header)
      if (
        decoded.x402Version !== 2
        || decoded.accepted.scheme !== 'exact'
        || decoded.accepted.network !== BASE_NETWORK
        || typeof decoded.payload.signature !== 'string'
        || typeof decoded.payload.authorization !== 'object'
        || decoded.payload.authorization === null
      ) {
        throw new Error('invalid x402 v2 exact EVM payload')
      }
      const authorization = decoded.payload.authorization as Record<string, unknown>
      if (
        typeof authorization.from !== 'string'
        || typeof authorization.to !== 'string'
        || typeof authorization.value !== 'string'
        || typeof authorization.validAfter !== 'string'
        || typeof authorization.validBefore !== 'string'
        || typeof authorization.nonce !== 'string'
      ) {
        throw new Error('invalid x402 v2 EIP-3009 authorization')
      }
      payment = decoded as ExactPaymentPayload
    } catch (error) {
      return paymentRequired(error instanceof Error ? error.message : 'Invalid or malformed payment header')
    }

    const authorization = payment.payload.authorization
    try {
      if (
        payment.accepted.amount !== requirements.amount
        || getAddress(payment.accepted.asset) !== getAddress(requirements.asset)
        || getAddress(payment.accepted.payTo) !== getAddress(requirements.payTo)
        || getAddress(authorization.to) !== getAddress(requirements.payTo)
        || BigInt(authorization.value) !== BigInt(requirements.amount)
      ) {
        return paymentRequired('payment does not match requirements')
      }
    } catch {
      return paymentRequired('payment does not match requirements')
    }

    let reserved = false
    try {
      if (payment.payload.signature.length !== 132) {
        return paymentRequired('smart-wallet signatures are not supported by PollenSettlementV2')
      }
      const verification = await relayer.verify(c.env, payment, requirements)
      if (!verification.isValid) {
        return paymentRequired(verification.invalidReason || 'payment verification failed')
      }
      reserved = true

      await next()
      if (c.res.status >= 400) {
        await relayer.release?.(c.env, payment)
        reserved = false
        return
      }

      const settlement = await relayer.settle(c.env, payment)
      if (!settlement.success) throw new Error(settlement.errorReason || 'settlement failed')
      reserved = false
      c.res.headers.set('PAYMENT-RESPONSE', encodePaymentResponseHeader(settlement))
    } catch (error) {
      if (reserved) {
        try { await relayer.release?.(c.env, payment) } catch { /* best-effort unlock */ }
      }
      return paymentRequired(error instanceof Error ? error.message : 'payment settlement failed')
    }
  }
}
