import { describe, expect, it, vi } from 'vitest'
import { fetchContributorEarnings } from './contributor-earnings'

const WALLET = '0x1111111111111111111111111111111111111111'

describe('contributor earnings', () => {
  it('does not touch the chain when no wallet is configured', async () => {
    const readBalances = vi.fn()
    const result = await fetchContributorEarnings({
      readWalletAddress: () => null,
      readBalances,
    })

    expect(result).toMatchObject({
      status: 'wallet_unconfigured',
      walletAddress: null,
      pollenBalance: null,
      pendingUsdc: null,
      claimStatus: 'unavailable',
    })
    expect(readBalances).not.toHaveBeenCalled()
  })

  it('reports read-only POLLEN and claimable USDC balances', async () => {
    const result = await fetchContributorEarnings({
      readWalletAddress: () => WALLET,
      readBalances: vi.fn().mockResolvedValue({
        pollenBalance: BigInt('12500000000000000000'),
        pendingUsdc: BigInt('2750000'),
      }),
      readActiveRevenue: vi.fn().mockResolvedValue({
        cutoverStatus: 'planned',
        totalClaimableAtomicUsdc: BigInt(0),
        claimCount: 0,
      }),
    })

    expect(result).toMatchObject({
      status: 'ready',
      walletAddress: WALLET,
      pollenBalance: '12.5',
      pendingUsdc: '2.75',
      claimStatus: 'claimable',
      activeRevenue: {
        cutoverStatus: 'planned',
        dataStatus: 'ready',
        totalClaimableUsdc: '0',
        claimCount: 0,
      },
    })
  })

  it('keeps future active-holder claims separate from legacy V2 accrual', async () => {
    const result = await fetchContributorEarnings({
      readWalletAddress: () => WALLET,
      readBalances: vi.fn().mockResolvedValue({
        pollenBalance: BigInt('1000000000000000000'),
        pendingUsdc: BigInt('1000000'),
      }),
      readActiveRevenue: vi.fn().mockResolvedValue({
        cutoverStatus: 'live',
        totalClaimableAtomicUsdc: BigInt('2500000'),
        claimCount: 2,
      }),
    })

    expect(result.pendingUsdc).toBe('1')
    expect(result.activeRevenue).toEqual({
      cutoverStatus: 'live',
      dataStatus: 'ready',
      totalClaimableUsdc: '2.5',
      claimCount: 2,
    })
  })

  it('keeps the configured wallet visible when RPC reads fail', async () => {
    const result = await fetchContributorEarnings({
      readWalletAddress: () => WALLET,
      readBalances: vi.fn().mockRejectedValue(new Error('private provider details')),
      readActiveRevenue: vi.fn().mockRejectedValue(new Error('claim endpoint unavailable')),
    })

    expect(result).toMatchObject({
      status: 'unavailable',
      walletAddress: WALLET,
      pollenBalance: null,
      pendingUsdc: null,
      claimStatus: 'unavailable',
    })
    expect(JSON.stringify(result)).not.toContain('private provider details')
  })
})
