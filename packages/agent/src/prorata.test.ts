import { describe, it, expect } from 'vitest'
import { computePayouts, scaleDecimal, type EligibleScore } from './prorata.js'
import { epochPool } from './epoch.js'

const POOL = epochPool(1) // 100_000e18

function row(id: string, score: string): EligibleScore {
  return { contributor_id: id, wallet_address: `0x${id.padStart(40, '0')}`, score }
}

describe('scaleDecimal', () => {
  it('scales integers and decimals to 1e6', () => {
    expect(scaleDecimal('123')).toBe(123_000_000n)
    expect(scaleDecimal('123.4567')).toBe(123_456_700n)
    expect(scaleDecimal('0.0001')).toBe(100n)
    expect(scaleDecimal('0')).toBe(0n)
  })

  it('truncates beyond the scale instead of rounding', () => {
    expect(scaleDecimal('1.9999999')).toBe(1_999_999n)
  })

  it('rejects negatives and garbage', () => {
    expect(() => scaleDecimal('-1')).toThrow()
    expect(() => scaleDecimal('abc')).toThrow()
    expect(() => scaleDecimal('1e5')).toThrow()
    expect(() => scaleDecimal('')).toThrow()
  })
})

describe('computePayouts', () => {
  it('splits the pool pro-rata on equal scores', () => {
    const payouts = computePayouts([row('a', '100'), row('b', '100')], POOL)
    expect(payouts).toHaveLength(2)
    expect(payouts[0].amountWei).toBe(POOL / 2n)
    expect(payouts[1].amountWei).toBe(POOL / 2n)
  })

  it('gives the whole pool to a single contributor', () => {
    const payouts = computePayouts([row('a', '42.5')], POOL)
    expect(payouts).toHaveLength(1)
    expect(payouts[0].amountWei).toBe(POOL)
  })

  it('floors each share so rounding dust never exceeds the pool', () => {
    // 3-way split of a pool not divisible by 3
    const rows = [row('a', '1'), row('b', '1'), row('c', '1')]
    const payouts = computePayouts(rows, POOL)
    const total = payouts.reduce((s, p) => s + p.amountWei, 0n)
    expect(total).toBeLessThanOrEqual(POOL)
    expect(POOL - total).toBeLessThan(3n) // dust < number of recipients
    for (const p of payouts) {
      expect(p.amountWei).toBe(POOL / 3n)
    }
  })

  it('sum of floors stays <= pool across ragged decimal scores', () => {
    const rows = [
      row('a', '13.3333'), row('b', '7.0001'), row('c', '0.0001'),
      row('d', '999.9999'), row('e', '54.5'), row('f', '1'),
    ]
    const payouts = computePayouts(rows, POOL)
    const total = payouts.reduce((s, p) => s + p.amountWei, 0n)
    expect(total).toBeLessThanOrEqual(POOL)
    // sanity: the dominant score takes the dominant share
    const d = payouts.find(p => p.contributor_id === 'd')!
    expect(d.amountWei > (POOL * 9n) / 10n).toBe(true)
  })

  it('drops zero amounts (zero score among nonzero scores)', () => {
    const payouts = computePayouts([row('a', '100'), row('b', '0')], POOL)
    expect(payouts).toHaveLength(1)
    expect(payouts[0].contributor_id).toBe('a')
    expect(payouts[0].amountWei).toBe(POOL)
  })

  it('drops amounts that floor to zero on tiny relative scores', () => {
    // b's share = pool * 1 / (huge + 1) — with a small pool this floors to 0
    const payouts = computePayouts([row('a', '4000000'), row('b', '0.000001')], 3n)
    expect(payouts.map(p => p.contributor_id)).toEqual(['a'])
  })

  it('returns empty when every score is zero', () => {
    expect(computePayouts([row('a', '0'), row('b', '0')], POOL)).toEqual([])
    expect(computePayouts([], POOL)).toEqual([])
  })

  it('is exact for the documented v1 formula scale (4 decimal places)', () => {
    // score ratio 2:1 must produce exactly 2:1 amounts
    const payouts = computePayouts([row('a', '66.6666'), row('b', '33.3333')], 300n)
    expect(payouts.find(p => p.contributor_id === 'a')!.amountWei).toBe(200n)
    expect(payouts.find(p => p.contributor_id === 'b')!.amountWei).toBe(100n)
  })
})
