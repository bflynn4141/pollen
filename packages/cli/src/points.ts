/**
 * `pollen points` — show on-chain POLLEN balance and simulated earnings.
 *
 * Reads the PollenToken contract on Base for real balance,
 * and computes projected earnings from local data.
 */
import {
  createPublicClient, http,
  type Address, parseAbi, formatUnits,
} from 'viem'
import { base } from 'viem/chains'
import { loadConfig, getWalletAddress } from './config.js'
import { currentEpoch } from './credits.js'
import { epochPool } from './epoch.js'

const TOKEN_ABI = parseAbi([
  'function balanceOf(address account) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function earned(address account) external view returns (uint256)',
  'function holdingSince(address account) external view returns (uint256)',
])

export interface PointsData {
  walletAddress: string
  pollenBalance: string
  totalSupply: string
  sharePercent: string
  pendingRevenue: string
  currentEpoch: number
  epochPoolSize: string
  holdingSinceBlock: string
  contractDeployed: boolean
}

export async function fetchPoints(connectionString: string): Promise<PointsData | null> {
  const config = loadConfig()
  if (!config) return null

  const walletAddress = getWalletAddress()
  if (!walletAddress) return null

  const tokenAddress = process.env.POLLEN_TOKEN_ADDRESS as Address | undefined
  const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org'

  const epoch = currentEpoch()
  const pool = epochPool(epoch)
  const poolFormatted = formatUnits(pool, 18)

  if (!tokenAddress) {
    return {
      walletAddress,
      pollenBalance: '0',
      totalSupply: '0',
      sharePercent: '0',
      pendingRevenue: '0',
      currentEpoch: epoch,
      epochPoolSize: poolFormatted,
      holdingSinceBlock: '—',
      contractDeployed: false,
    }
  }

  const publicClient = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  })

  try {
    const [balance, totalSupply, earned, holdingSince] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress,
        abi: TOKEN_ABI,
        functionName: 'balanceOf',
        args: [walletAddress as Address],
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: TOKEN_ABI,
        functionName: 'totalSupply',
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: TOKEN_ABI,
        functionName: 'earned',
        args: [walletAddress as Address],
      }),
      publicClient.readContract({
        address: tokenAddress,
        abi: TOKEN_ABI,
        functionName: 'holdingSince',
        args: [walletAddress as Address],
      }),
    ])

    const sharePercent = totalSupply > 0n
      ? ((balance * 10000n) / totalSupply).toString()
      : '0'

    return {
      walletAddress,
      pollenBalance: formatUnits(balance, 18),
      totalSupply: formatUnits(totalSupply, 18),
      sharePercent: (Number(sharePercent) / 100).toFixed(2),
      pendingRevenue: formatUnits(earned, 6),
      currentEpoch: epoch,
      epochPoolSize: poolFormatted,
      holdingSinceBlock: holdingSince > 0n ? holdingSince.toString() : '—',
      contractDeployed: true,
    }
  } catch {
    return {
      walletAddress,
      pollenBalance: '0',
      totalSupply: '0',
      sharePercent: '0',
      pendingRevenue: '0',
      currentEpoch: epoch,
      epochPoolSize: poolFormatted,
      holdingSinceBlock: '—',
      contractDeployed: false,
    }
  }
}

export function renderPoints(data: PointsData): string {
  const lines: string[] = []

  lines.push('')
  lines.push('  \x1b[1mPOLLEN Balance\x1b[0m')
  lines.push('  \x1b[2m──────────────────────────────────────\x1b[0m')
  lines.push('')

  if (!data.contractDeployed) {
    lines.push('  \x1b[33mToken contract not deployed yet.\x1b[0m')
    lines.push('  \x1b[2mSet POLLEN_TOKEN_ADDRESS to view on-chain balance.\x1b[0m')
    lines.push('')
    lines.push(`  Wallet:        ${data.walletAddress}`)
    lines.push(`  Current Epoch: ${data.currentEpoch}`)
    lines.push(`  Epoch Pool:    ${Number(data.epochPoolSize).toLocaleString()} POLLEN`)
    lines.push('')
    return lines.join('\n')
  }

  const balance = Number(data.pollenBalance)
  const supply = Number(data.totalSupply)

  lines.push(`  \x1b[38;2;184;115;51m${balance.toLocaleString()}\x1b[0m \x1b[2mPOLLEN\x1b[0m`)
  lines.push('')
  lines.push(`  Wallet:         ${data.walletAddress.slice(0, 6)}…${data.walletAddress.slice(-4)}`)
  lines.push(`  Share:          ${data.sharePercent}% of ${supply.toLocaleString()} total supply`)
  lines.push(`  Pending USDC:   $${data.pendingRevenue}`)
  lines.push(`  Holding since:  block ${data.holdingSinceBlock}`)
  lines.push('')
  lines.push(`  Current Epoch:  ${data.currentEpoch}`)
  lines.push(`  Epoch Pool:     ${Number(data.epochPoolSize).toLocaleString()} POLLEN`)
  lines.push('')

  return lines.join('\n')
}
