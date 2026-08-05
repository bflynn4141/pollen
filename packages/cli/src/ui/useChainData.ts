/**
 * React hook that polls on-chain POLLEN token data.
 *
 * Reuses the viem + TOKEN_ABI pattern from points.ts but wrapped
 * in useState/useEffect for live updates every 10 seconds.
 */
import { useState, useEffect } from 'react'
import {
  createPublicClient, http,
  type Address, parseAbi, formatUnits,
} from 'viem'
import { base } from 'viem/chains'
import { getWalletAddress } from '../config.js'
import { currentEpoch } from '../credits.js'
import { epochPool } from '../epoch.js'

const TOKEN_ABI = parseAbi([
  'function balanceOf(address account) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function earned(address account) external view returns (uint256)',
  'function holdingSince(address account) external view returns (uint256)',
])

export interface ChainData {
  pollenBalance: number
  totalSupply: number
  sharePercent: number
  pendingUsdc: number
  epoch: number
  epochPool: number
  holdingSinceBlock: string
  walletAddress: string | null
  contractDeployed: boolean
  loading: boolean
}

const EMPTY: ChainData = {
  pollenBalance: 0,
  totalSupply: 0,
  sharePercent: 0,
  pendingUsdc: 0,
  epoch: currentEpoch(),
  epochPool: Number(formatUnits(epochPool(currentEpoch()), 18)),
  holdingSinceBlock: '—',
  walletAddress: null,
  contractDeployed: false,
  loading: false,
}

export function useChainData(pollMs = 10_000): ChainData {
  const [data, setData] = useState<ChainData>({ ...EMPTY, loading: true })

  useEffect(() => {
    const tokenAddress = process.env.POLLEN_TOKEN_ADDRESS as Address | undefined
    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org'
    const walletAddress = getWalletAddress()

    if (!walletAddress || !tokenAddress) {
      setData({
        ...EMPTY,
        walletAddress: walletAddress ?? null,
        loading: false,
      })
      return
    }

    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    })

    let cancelled = false

    async function poll() {
      const epoch = currentEpoch()
      const pool = epochPool(epoch)

      try {
        const [balance, supply, earned, holdingSince] = await Promise.all([
          client.readContract({ address: tokenAddress!, abi: TOKEN_ABI, functionName: 'balanceOf', args: [walletAddress as Address] }),
          client.readContract({ address: tokenAddress!, abi: TOKEN_ABI, functionName: 'totalSupply' }),
          client.readContract({ address: tokenAddress!, abi: TOKEN_ABI, functionName: 'earned', args: [walletAddress as Address] }),
          client.readContract({ address: tokenAddress!, abi: TOKEN_ABI, functionName: 'holdingSince', args: [walletAddress as Address] }),
        ])

        if (cancelled) return

        const balNum = Number(formatUnits(balance, 18))
        const supNum = Number(formatUnits(supply, 18))
        const share = supNum > 0 ? (balNum / supNum) * 100 : 0

        setData({
          pollenBalance: balNum,
          totalSupply: supNum,
          sharePercent: share,
          pendingUsdc: Number(formatUnits(earned, 6)),
          epoch,
          epochPool: Number(formatUnits(pool, 18)),
          holdingSinceBlock: holdingSince > 0n ? holdingSince.toString() : '—',
          walletAddress,
          contractDeployed: true,
          loading: false,
        })
      } catch {
        if (cancelled) return
        setData({
          ...EMPTY,
          walletAddress,
          epoch,
          epochPool: Number(formatUnits(pool, 18)),
          loading: false,
        })
      }
    }

    poll()
    const id = setInterval(poll, pollMs)
    return () => { cancelled = true; clearInterval(id) }
  }, [pollMs])

  return data
}
