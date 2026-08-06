/**
 * Shared x402 payment signing — EIP-3009 transferWithAuthorization over USDC.
 *
 * Extracted from demo-query.ts so every x402 client in the CLI (demo REPL,
 * stableemail, future paid endpoints) signs payments the same way instead of
 * duplicating the EIP-712 plumbing.
 */
import { randomBytes } from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'

/** USDC on Base mainnet */
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

export interface X402SignOptions {
  /** Recipient of the transferWithAuthorization (settlement contract or payTo) */
  payTo: `0x${string}`
  /** Amount in USDC base units (6 decimals) */
  amountUnits: bigint
  /** x402 network identifier to embed in the payment envelope (e.g. 'base', 'base-mainnet') */
  network: string
  /** ERC-20 token contract (defaults to USDC on Base) */
  asset?: `0x${string}`
  /** EIP-712 domain name (defaults to USDC's 'USD Coin') */
  domainName?: string
  /** EIP-712 domain version (defaults to '2') */
  domainVersion?: string
  chainId?: number
  /** Authorization validity window in seconds (default 600) */
  validSeconds?: number
}

export interface X402PaymentEnvelope {
  x402Version: number
  scheme: 'exact'
  network: string
  payload: {
    signature: `0x${string}`
    authorization: {
      from: string
      to: string
      value: string
      validAfter: string
      validBefore: string
      nonce: string
    }
  }
}

/**
 * Sign an EIP-3009 transferWithAuthorization and wrap it in an x402 v1
 * payment envelope. Returns both the envelope and its base64 encoding for
 * use as an `X-PAYMENT` header.
 */
export async function signX402Payment(
  privateKey: `0x${string}`,
  opts: X402SignOptions,
): Promise<{ payment: X402PaymentEnvelope; header: string; from: `0x${string}` }> {
  const account = privateKeyToAccount(privateKey)
  const now = Math.floor(Date.now() / 1000)
  const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`

  const authorization = {
    from: account.address,
    to: opts.payTo,
    value: opts.amountUnits,
    validAfter: 0n,
    validBefore: BigInt(now + (opts.validSeconds ?? 600)),
    nonce,
  }

  const signature = await account.signTypedData({
    domain: {
      name: opts.domainName ?? 'USD Coin',
      version: opts.domainVersion ?? '2',
      chainId: opts.chainId ?? 8453,
      verifyingContract: opts.asset ?? USDC_BASE,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  })

  const payment: X402PaymentEnvelope = {
    x402Version: 1,
    scheme: 'exact',
    network: opts.network,
    payload: {
      signature,
      authorization: {
        from: authorization.from,
        to: authorization.to,
        value: authorization.value.toString(),
        validAfter: authorization.validAfter.toString(),
        validBefore: authorization.validBefore.toString(),
        nonce: authorization.nonce,
      },
    },
  }

  return {
    payment,
    header: Buffer.from(JSON.stringify(payment)).toString('base64'),
    from: account.address,
  }
}
