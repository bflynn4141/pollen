import type { MiddlewareHandler } from 'hono'
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
import { exact } from 'x402/schemes'
import {
  settleResponseHeader,
  type PaymentRequirements,
  type SettleResponse,
  type VerifyResponse,
} from 'x402/types'

const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const DEFAULT_BASE_RPC = 'https://mainnet.base.org'

const PRICE_UNITS: Record<string, string> = {
  '/tools/history': '10000',
  '/mcp/history': '10000',
  '/grid': '50000',
  '/export': '250000',
}

const DESCRIPTIONS: Record<string, string> = {
  '/tools/history': 'Full weekly history for one tool (k-anonymized, >=5 contributors per cell)',
  '/mcp/history': 'Full weekly history for one MCP server (k-anonymized, >=5 contributors per cell)',
  '/grid': 'Full tool x week and MCP-server x week grid, all published history',
  '/export': 'Full dump of every published rollup cell',
}

export interface X402RelayEnv {
  X402_PAY_TO?: string
  X402_RELAYER_KEY?: string
  BASE_RPC_URL?: string
}

interface ExactPaymentPayload {
  x402Version: number
  scheme: 'exact'
  network: 'base'
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
}

function paidRoute(path: string): string | null {
  const canonical = path.startsWith('/api/v1/') ? path.slice('/api/v1'.length) : path
  return canonical in PRICE_UNITS ? canonical : null
}

function requirementsFor(url: string, route: string, payTo: string): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'base',
    maxAmountRequired: PRICE_UNITS[route],
    resource: url,
    description: DESCRIPTIONS[route],
    mimeType: 'application/json',
    payTo: getAddress(payTo),
    maxTimeoutSeconds: 60,
    asset: BASE_USDC,
    extra: { name: 'USD Coin', version: '2' },
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

const baseRelayer: PaymentRelayer = {
  async verify(env, payment, requirements) {
    const { publicClient } = clients(env)
    return exact.evm.verify(publicClient, payment as any, requirements)
  },

  async settle(env, payment) {
    const { publicClient, walletClient } = clients(env)
    const { authorization, signature } = payment.payload
    if (signature.length !== 132) throw new Error('smart-wallet signatures are not supported')
    const parsed = parseSignature(signature)
    const v = Number(parsed.yParity) + 27
    const transaction = await walletClient.writeContract({
      address: getAddress(authorization.to),
      abi: [{
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
      }] as const,
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
    return { success: true, payer: authorization.from, transaction, network: 'base' }
  },
}

export function createPollenPaymentMiddleware(
  relayer: PaymentRelayer = baseRelayer,
): MiddlewareHandler<{ Bindings: X402RelayEnv }> {
  return async (c, next) => {
    const route = paidRoute(c.req.path)
    if (!route) return next()

    if (!c.env.X402_PAY_TO || !c.env.X402_RELAYER_KEY) {
      return c.json({ error: 'x402 settlement is not configured' }, 503)
    }

    let requirements: PaymentRequirements
    try {
      requirements = requirementsFor(c.req.url, route, c.env.X402_PAY_TO)
    } catch {
      return c.json({ error: 'x402 settlement is not configured' }, 503)
    }

    const header = c.req.header('X-PAYMENT')
    if (!header) {
      return c.json({ error: 'X-PAYMENT header is required', accepts: [requirements], x402Version: 1 }, 402)
    }

    let payment: ExactPaymentPayload
    try {
      payment = exact.evm.decodePayment(header) as ExactPaymentPayload
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : 'Invalid or malformed payment header',
        accepts: [requirements],
        x402Version: 1,
      }, 402)
    }

    const authorization = payment.payload.authorization
    if (
      payment.network !== 'base'
      || getAddress(authorization.to) !== getAddress(requirements.payTo)
      || BigInt(authorization.value) < BigInt(requirements.maxAmountRequired)
    ) {
      return c.json({ error: 'payment does not match requirements', accepts: [requirements], x402Version: 1 }, 402)
    }

    try {
      const verification = await relayer.verify(c.env, payment, requirements)
      if (!verification.isValid) {
        return c.json({ error: verification.invalidReason || 'payment verification failed', accepts: [requirements], x402Version: 1 }, 402)
      }

      await next()
      if (c.res.status >= 400) return

      const settlement = await relayer.settle(c.env, payment)
      if (!settlement.success) throw new Error(settlement.errorReason || 'settlement failed')
      c.res.headers.set('X-PAYMENT-RESPONSE', settleResponseHeader(settlement))
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : 'payment settlement failed',
        accepts: [requirements],
        x402Version: 1,
      }, 402)
    }
  }
}
