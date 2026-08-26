import { describe, expect, it } from 'vitest'
import { zeroHash } from 'viem'
import {
  buildActiveRevenueMerkleTree,
  verifyActiveRevenueProof,
} from './active-revenue-merkle.js'

const rows = [
  { contributorId: 'b', walletAddress: '0x2222222222222222222222222222222222222222', amountAtomicUsdc: 200n },
  { contributorId: 'a', walletAddress: '0x1111111111111111111111111111111111111111', amountAtomicUsdc: 100n },
] as const

describe('active-revenue Merkle artifacts', () => {
  it('sorts wallets, assigns deterministic indices, and produces valid proofs', () => {
    const tree = buildActiveRevenueMerkleTree(30, [...rows])

    expect(tree.root).not.toBe(zeroHash)
    expect(tree.leaves.map(leaf => [leaf.index, leaf.walletAddress, leaf.amountAtomicUsdc]))
      .toEqual([
        [0, '0x1111111111111111111111111111111111111111', 100n],
        [1, '0x2222222222222222222222222222222222222222', 200n],
      ])
    for (const leaf of tree.leaves) {
      expect(verifyActiveRevenueProof(tree.root, leaf, leaf.proof)).toBe(true)
    }
  })

  it('rejects a proof if epoch, index, wallet, or amount changes', () => {
    const tree = buildActiveRevenueMerkleTree(30, [...rows])
    const leaf = tree.leaves[0]

    expect(verifyActiveRevenueProof(tree.root, { ...leaf, epoch: 29 }, leaf.proof)).toBe(false)
    expect(verifyActiveRevenueProof(tree.root, { ...leaf, index: 9 }, leaf.proof)).toBe(false)
    expect(verifyActiveRevenueProof(tree.root, {
      ...leaf,
      walletAddress: '0x3333333333333333333333333333333333333333',
    }, leaf.proof)).toBe(false)
    expect(verifyActiveRevenueProof(tree.root, {
      ...leaf,
      amountAtomicUsdc: leaf.amountAtomicUsdc + 1n,
    }, leaf.proof)).toBe(false)
  })

  it('uses the zero root and no leaves when there is no eligible allocation', () => {
    expect(buildActiveRevenueMerkleTree(30, [])).toEqual({ root: zeroHash, leaves: [] })
  })
})
