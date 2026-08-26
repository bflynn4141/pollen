import { describe, expect, it } from 'vitest'
import { reconcileActiveRevenuePool } from './active-revenue-pool.js'

describe('active revenue pool reconciliation', () => {
  it('adds unique V3 deposits in the epoch block window to prior carry', () => {
    const result = reconcileActiveRevenuePool({
      startBlock: BigInt(100),
      endBlock: BigInt(199),
      carryInAtomicUsdc: BigInt(7),
      deposits: [
        { blockNumber: BigInt(100), transactionHash: '0xaaa', logIndex: 0, amountAtomicUsdc: BigInt(10) },
        { blockNumber: BigInt(199), transactionHash: '0xbbb', logIndex: 3, amountAtomicUsdc: BigInt(20) },
      ],
    })

    expect(result.settledAtomicUsdc).toBe(BigInt(30))
    expect(result.distributableAtomicUsdc).toBe(BigInt(37))
    expect(result.depositCount).toBe(2)
  })

  it('fails closed on duplicates, out-of-window events, or negative carry', () => {
    const event = {
      blockNumber: BigInt(150),
      transactionHash: '0xaaa',
      logIndex: 0,
      amountAtomicUsdc: BigInt(10),
    }
    expect(() => reconcileActiveRevenuePool({
      startBlock: BigInt(100),
      endBlock: BigInt(199),
      carryInAtomicUsdc: BigInt(0),
      deposits: [event, event],
    })).toThrow(/duplicate deposit event/i)
    expect(() => reconcileActiveRevenuePool({
      startBlock: BigInt(100),
      endBlock: BigInt(199),
      carryInAtomicUsdc: BigInt(0),
      deposits: [{ ...event, blockNumber: BigInt(200) }],
    })).toThrow(/outside epoch block window/i)
    expect(() => reconcileActiveRevenuePool({
      startBlock: BigInt(100),
      endBlock: BigInt(199),
      carryInAtomicUsdc: BigInt(-1),
      deposits: [],
    })).toThrow(/carry cannot be negative/i)
  })
})
