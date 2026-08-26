import { describe, expect, it, vi } from 'vitest'
import { epochBounds } from './epoch.js'
import { readPollenSnapshot, type PollenSnapshotClient } from './pollen-snapshot.js'

const EPOCH = 30
const TOKEN = '0x8ED2E55875Bf4C3082364441FfD314Ec6E228318'
const BLOCK = 36_000_000n

describe('POLLEN epoch-boundary snapshot', () => {
  it('reads every balance at the explicit historical block', async () => {
    const boundary = BigInt(Math.floor(epochBounds(EPOCH).endsAt / 1000))
    const getBlock = vi.fn(async ({ blockNumber }: { blockNumber: bigint }) => ({
      timestamp: blockNumber === BLOCK ? boundary : boundary + BigInt(2),
    }))
    const readContract = vi.fn(async (
      { args }: Parameters<PollenSnapshotClient['readContract']>[0],
    ) => args[0].endsWith('1') ? 10n : 20n)
    const result = await readPollenSnapshot({ getBlock, readContract }, {
      distributionEpoch: EPOCH,
      tokenAddress: TOKEN,
      blockNumber: BLOCK,
      walletAddresses: [
        '0x0000000000000000000000000000000000000002',
        '0x0000000000000000000000000000000000000001',
      ],
    })

    expect(getBlock.mock.calls.map(([call]) => call.blockNumber)).toEqual([BLOCK, BLOCK + BigInt(1)])
    expect(readContract).toHaveBeenCalledTimes(2)
    expect(readContract.mock.calls.every(([call]) => call.blockNumber === BLOCK)).toBe(true)
    expect(result.balances.map(row => row.balanceWei)).toEqual([10n, 20n])
  })

  it('rejects a future or stale boundary block and duplicate wallets', async () => {
    const boundary = Math.floor(epochBounds(EPOCH).endsAt / 1000)
    const readContract = vi.fn(async () => 1n)

    await expect(readPollenSnapshot({
      getBlock: async ({ blockNumber }) => ({
        timestamp: blockNumber === BLOCK ? BigInt(boundary + 1) : BigInt(boundary + 2),
      }),
      readContract,
    }, {
      distributionEpoch: EPOCH,
      tokenAddress: TOKEN,
      blockNumber: BLOCK,
      walletAddresses: ['0x0000000000000000000000000000000000000001'],
    })).rejects.toThrow(/last block at or before/i)

    await expect(readPollenSnapshot({
      getBlock: async ({ blockNumber }) => ({
        timestamp: blockNumber === BLOCK ? BigInt(boundary - 901) : BigInt(boundary + 1),
      }),
      readContract,
    }, {
      distributionEpoch: EPOCH,
      tokenAddress: TOKEN,
      blockNumber: BLOCK,
      walletAddresses: ['0x0000000000000000000000000000000000000001'],
    })).rejects.toThrow(/last block at or before/i)

    await expect(readPollenSnapshot({
      getBlock: async ({ blockNumber }) => ({
        timestamp: blockNumber === BLOCK ? BigInt(boundary) : BigInt(boundary + 1),
      }),
      readContract,
    }, {
      distributionEpoch: EPOCH,
      tokenAddress: TOKEN,
      blockNumber: BLOCK,
      walletAddresses: [
        '0x0000000000000000000000000000000000000001',
        '0x0000000000000000000000000000000000000001',
      ],
    })).rejects.toThrow(/duplicate snapshot wallet/i)
  })

  it('rejects a block when its successor is also at or before the boundary', async () => {
    const boundary = Math.floor(epochBounds(EPOCH).endsAt / 1000)
    await expect(readPollenSnapshot({
      getBlock: async ({ blockNumber }) => ({
        timestamp: blockNumber === BLOCK ? BigInt(boundary - 2) : BigInt(boundary),
      }),
      readContract: async () => BigInt(1),
    }, {
      distributionEpoch: EPOCH,
      tokenAddress: TOKEN,
      blockNumber: BLOCK,
      walletAddresses: ['0x0000000000000000000000000000000000000001'],
    })).rejects.toThrow(/successor block/i)
  })
})
