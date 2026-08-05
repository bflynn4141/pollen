/**
 * `pollen claim` support.
 *
 * POLLEN token payouts are automatic since v2: the payout agent mints
 * weekly (epochs close Tuesdays 00:00 UTC) directly to verified wallets via
 * PollenTokenV2.mintBatch — there is nothing to claim. `fetchWalletPayouts`
 * reads your payout history from Neon for `pollen claim`'s status output.
 *
 * USDC revenue is still pull-based (`pollen claim --revenue`):
 *   - Para wallets claim via the Clara proxy (no private key needed)
 *   - BYO wallets claim directly with POLLEN_PRIVATE_KEY
 */
import {
  createPublicClient, createWalletClient, http,
  type Address, type Hex,
  parseAbi,
} from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { getWalletAddress, PROXY_URL, type ParaWallet } from './config.js'
import { neon } from '@neondatabase/serverless'

// --- PollenTokenV2 ABI (minimal) ---

const TOKEN_ABI = parseAbi([
  'function claimRevenue() external',
  'function earned(address account) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
])

// ============================================
// Payout status (push model — read-only)
// ============================================

export interface WalletPayout {
  epoch: number
  amount: string
  status: string
  tx_hash: string | null
}

/**
 * Read this wallet's payout rows from Neon (payouts table, migration 003).
 * Returns null when the table doesn't exist yet (graceful degradation).
 */
export async function fetchWalletPayouts(
  connectionString: string,
  walletAddress: string,
): Promise<WalletPayout[] | null> {
  const sql = neon(connectionString)
  try {
    const rows = await sql`
      SELECT epoch, amount::text AS amount, status, tx_hash
      FROM payouts
      WHERE LOWER(wallet_address) = ${walletAddress.toLowerCase()}
      ORDER BY epoch DESC
    `
    return rows.map(r => ({
      epoch: r.epoch as number,
      amount: r.amount as string,
      status: r.status as string,
      tx_hash: (r.tx_hash as string | null) ?? null,
    }))
  } catch {
    return null
  }
}

// ============================================
// USDC revenue claim — BYO wallet (private key)
// ============================================

/**
 * Claim USDC revenue from POLLEN holdings on PollenTokenV2.
 */
export async function claimRevenue(
  tokenAddress: Address,
  rpcUrl: string,
  privateKey: Hex,
): Promise<{ txHash: Hex; amount: bigint } | { error: string }> {
  const addr = getWalletAddress()
  if (!addr) return { error: 'No wallet configured. Run: pollen wallet' }

  const walletAddress = addr as Address

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  })

  // Check pending revenue
  const pending = await publicClient.readContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'earned',
    args: [walletAddress],
  })

  if (pending === 0n) {
    return { error: 'No pending revenue to claim.' }
  }

  // Submit claim
  const account = privateKeyToAccount(privateKey)
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(rpcUrl),
  })

  const txHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'claimRevenue',
  })

  return { txHash, amount: pending }
}

// ============================================
// USDC revenue claim — Para wallet (via proxy)
// ============================================

/**
 * Claim USDC revenue via Clara proxy (Para wallet path).
 */
export async function claimRevenueViaProxy(
  paraWallet: ParaWallet,
  apiKey: string,
): Promise<{ txHash: string } | { error: string }> {
  const tokenAddress = process.env.POLLEN_TOKEN_ADDRESS
  if (!tokenAddress) return { error: 'POLLEN_TOKEN_ADDRESS not set (PollenTokenV2 on Base).' }

  const res = await fetch(`${PROXY_URL}/pollen/claim-revenue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Pollen-Key': apiKey,
    },
    body: JSON.stringify({
      walletId: paraWallet.wallet_id,
      address: paraWallet.address,
      tokenAddress,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { error: `Revenue claim failed: ${text}` }
  }

  const { txHash } = await res.json() as { txHash: string }
  return { txHash }
}
