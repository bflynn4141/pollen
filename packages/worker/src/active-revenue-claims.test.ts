import { describe, expect, it, vi } from 'vitest'
import { handleActiveRevenueClaims, type ActiveRevenueClaimStore } from './active-revenue-claims'

const WALLET = '0x1111111111111111111111111111111111111111'
const VAULT = '0x2222222222222222222222222222222222222222'
const ROOT = `0x${'ab'.repeat(32)}` as `0x${string}`
const PROOF = [`0x${'cd'.repeat(32)}` as `0x${string}`]

function store(rows: Awaited<ReturnType<ActiveRevenueClaimStore['readWalletClaims']>>) {
  return { readWalletClaims: vi.fn(async () => rows) }
}

describe('active revenue claim lookup', () => {
  it('rejects invalid wallet addresses before querying storage', async () => {
    const claims = store([])
    const response = await handleActiveRevenueClaims('not-an-address', claims, 'planned')

    expect(response.status).toBe(400)
    expect(claims.readWalletClaims).not.toHaveBeenCalled()
  })

  it('returns only public Merkle claim material and cutover state', async () => {
    const claims = store([{
      epoch: 30,
      claimIndex: 4,
      amountAtomicUsdc: '2500000',
      proof: PROOF,
      merkleRoot: ROOT,
      vaultAddress: VAULT,
      claimDeadline: '2026-12-01T00:00:00.000Z',
      distributionStatus: 'published',
      claimStatus: 'published',
      claimTxHash: null,
    }])
    const response = await handleActiveRevenueClaims(WALLET, claims, 'live')
    const body = await response.json() as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(claims.readWalletClaims).toHaveBeenCalledWith(WALLET)
    expect(body).toMatchObject({
      formula: 'active-holder-v1',
      cutover_status: 'live',
      wallet_address: WALLET,
      total_claimable_atomic_usdc: '2500000',
    })
    expect(JSON.stringify(body)).not.toMatch(/world|contributor|score|binding/i)
  })

  it('returns a planned empty state without inventing earnings', async () => {
    const response = await handleActiveRevenueClaims(WALLET, store([]), 'planned')
    expect(await response.json()).toMatchObject({
      cutover_status: 'planned',
      claims: [],
      total_claimable_atomic_usdc: '0',
    })
  })
})
