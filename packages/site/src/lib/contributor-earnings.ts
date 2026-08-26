import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseAbi,
  type Address,
} from 'viem'
import { base } from 'viem/chains'

/** Deployed PollenTokenV2 on Base. Public contract addresses are not secrets. */
export const DEFAULT_POLLEN_TOKEN_ADDRESS = '0x8ED2E55875Bf4C3082364441FfD314Ec6E228318' as Address

const TOKEN_ABI = parseAbi([
  'function balanceOf(address account) external view returns (uint256)',
  'function earned(address account) external view returns (uint256)',
])

export type ContributorEarningsStatus = 'ready' | 'wallet_unconfigured' | 'unavailable'
export type RevenueClaimStatus = 'claimable' | 'nothing_to_claim' | 'unavailable'
export type ActiveRevenueCutoverStatus = 'planned' | 'live'

export interface ActiveRevenueSummary {
  cutoverStatus: ActiveRevenueCutoverStatus
  dataStatus: 'ready' | 'unavailable'
  totalClaimableUsdc: string | null
  claimCount: number
}

export interface ContributorEarnings {
  status: ContributorEarningsStatus
  walletAddress: Address | null
  pollenBalance: string | null
  pendingUsdc: string | null
  claimStatus: RevenueClaimStatus
  activeRevenue: ActiveRevenueSummary
  tokenAddress: Address
}

interface ReadBalancesArgs {
  walletAddress: Address
  tokenAddress: Address
  rpcUrl: string
}

interface RawBalances {
  pollenBalance: bigint
  pendingUsdc: bigint
}

interface RawActiveRevenue {
  cutoverStatus: ActiveRevenueCutoverStatus
  totalClaimableAtomicUsdc: bigint
  claimCount: number
}

interface FetchContributorEarningsOptions {
  readWalletAddress?: () => string | null
  readBalances?: (args: ReadBalancesArgs) => Promise<RawBalances>
  readActiveRevenue?: (args: {
    walletAddress: Address
    apiUrl: string
  }) => Promise<RawActiveRevenue>
  rpcUrl?: string
  activeRevenueApiUrl?: string
  activeRevenueCutoverStatus?: ActiveRevenueCutoverStatus
  tokenAddress?: string
}

interface LocalPollenConfig {
  wallet_address?: unknown
  para_wallet?: { address?: unknown }
}

/**
 * Read only the public payout address from the local CLI config. Network
 * credentials, wallet IDs, recovery email, and signatures never leave this
 * function or reach rendered props.
 */
export function readConfiguredWalletAddress(
  configPath = process.env.POLLEN_CONFIG_PATH ?? join(homedir(), '.pollen', 'config.json'),
): Address | null {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as LocalPollenConfig
    const candidate = config.para_wallet?.address ?? config.wallet_address
    return typeof candidate === 'string' && isAddress(candidate) ? getAddress(candidate) : null
  } catch {
    return null
  }
}

async function readOnChainBalances({
  walletAddress,
  tokenAddress,
  rpcUrl,
}: ReadBalancesArgs): Promise<RawBalances> {
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl, { timeout: 10_000 }),
  })
  const [pollenBalance, pendingUsdc] = await Promise.all([
    client.readContract({
      address: tokenAddress,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [walletAddress],
    }),
    client.readContract({
      address: tokenAddress,
      abi: TOKEN_ABI,
      functionName: 'earned',
      args: [walletAddress],
    }),
  ])
  return { pollenBalance, pendingUsdc }
}

async function readActiveRevenueClaims({
  walletAddress,
  apiUrl,
}: {
  walletAddress: Address
  apiUrl: string
}): Promise<RawActiveRevenue> {
  const baseUrl = apiUrl.replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/api/v1/active-revenue/claims/${walletAddress}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: 60 },
  })
  if (!response.ok) throw new Error(`active revenue API returned ${response.status}`)
  const body = await response.json() as {
    cutover_status?: unknown
    total_claimable_atomic_usdc?: unknown
    claims?: unknown
  }
  if (
    body.cutover_status !== 'planned'
    && body.cutover_status !== 'live'
  ) throw new Error('invalid active revenue cutover status')
  if (typeof body.total_claimable_atomic_usdc !== 'string' || !Array.isArray(body.claims)) {
    throw new Error('invalid active revenue response')
  }
  return {
    cutoverStatus: body.cutover_status,
    totalClaimableAtomicUsdc: BigInt(body.total_claimable_atomic_usdc),
    claimCount: body.claims.length,
  }
}

/**
 * Fetch a contributor's public, read-only token state. Errors are deliberately
 * collapsed to an unavailable status so RPC details or local configuration
 * contents cannot leak into the UI.
 */
export async function fetchContributorEarnings(
  options: FetchContributorEarningsOptions = {},
): Promise<ContributorEarnings> {
  const tokenCandidate = options.tokenAddress
    ?? process.env.POLLEN_TOKEN_ADDRESS
    ?? DEFAULT_POLLEN_TOKEN_ADDRESS
  const tokenAddress = isAddress(tokenCandidate)
    ? getAddress(tokenCandidate)
    : DEFAULT_POLLEN_TOKEN_ADDRESS
  const walletCandidate = (options.readWalletAddress ?? readConfiguredWalletAddress)()
  const fallbackCutoverStatus: ActiveRevenueCutoverStatus = options.activeRevenueCutoverStatus
    ?? (process.env.ACTIVE_REVENUE_CUTOVER_STATUS === 'live' ? 'live' : 'planned')
  const walletAddress = walletCandidate && isAddress(walletCandidate)
    ? getAddress(walletCandidate)
    : null

  if (!walletAddress) {
    return {
      status: 'wallet_unconfigured',
      walletAddress: null,
      pollenBalance: null,
      pendingUsdc: null,
      claimStatus: 'unavailable',
      activeRevenue: {
        cutoverStatus: fallbackCutoverStatus,
        dataStatus: 'unavailable',
        totalClaimableUsdc: null,
        claimCount: 0,
      },
      tokenAddress,
    }
  }

  const [legacyResult, activeResult] = await Promise.allSettled([
    (options.readBalances ?? readOnChainBalances)({
      walletAddress,
      tokenAddress,
      rpcUrl: options.rpcUrl ?? process.env.BASE_RPC_URL ?? 'https://mainnet.base.org',
    }),
    (options.readActiveRevenue ?? readActiveRevenueClaims)({
      walletAddress,
      apiUrl: options.activeRevenueApiUrl
        ?? process.env.POLLEN_API_URL
        ?? 'https://pollen-api.bflynn4141.workers.dev',
    }),
  ])

  const activeRevenue: ActiveRevenueSummary = activeResult.status === 'fulfilled'
    ? {
        cutoverStatus: activeResult.value.cutoverStatus,
        dataStatus: 'ready',
        totalClaimableUsdc: formatUnits(activeResult.value.totalClaimableAtomicUsdc, 6),
        claimCount: activeResult.value.claimCount,
      }
    : {
        cutoverStatus: fallbackCutoverStatus,
        dataStatus: 'unavailable',
        totalClaimableUsdc: null,
        claimCount: 0,
      }

  if (legacyResult.status === 'fulfilled') {
    const { pollenBalance, pendingUsdc } = legacyResult.value
    return {
      status: 'ready',
      walletAddress,
      pollenBalance: formatUnits(pollenBalance, 18),
      pendingUsdc: formatUnits(pendingUsdc, 6),
      claimStatus: pendingUsdc > BigInt(0) ? 'claimable' : 'nothing_to_claim',
      activeRevenue,
      tokenAddress,
    }
  }
  return {
    status: 'unavailable',
    walletAddress,
    pollenBalance: null,
    pendingUsdc: null,
    claimStatus: 'unavailable',
    activeRevenue,
    tokenAddress,
  }
}
