import { describe, expect, it } from 'vitest'
import { parseActiveRevenuePlanFlags } from './active-revenue-cli.js'

describe('active revenue CLI flags', () => {
  it('accepts a zero pool for a read-only shadow epoch', () => {
    expect(parseActiveRevenuePlanFlags([
      '--epoch', '26',
      '--pool-atomic', '0',
      '--snapshot-block', '50413326',
    ])).toEqual({
      epoch: 26,
      poolAtomicUsdc: BigInt(0),
      snapshotBlock: BigInt(50413326),
    })
  })

  it('keeps epoch and snapshot block strictly positive', () => {
    expect(() => parseActiveRevenuePlanFlags([
      '--epoch', '0',
      '--pool-atomic', '0',
      '--snapshot-block', '50413326',
    ])).toThrow('epoch')
    expect(() => parseActiveRevenuePlanFlags([
      '--epoch', '26',
      '--pool-atomic', '0',
      '--snapshot-block', '0',
    ])).toThrow('snapshot')
  })

  it('rejects a negative or malformed pool', () => {
    expect(() => parseActiveRevenuePlanFlags([
      '--epoch', '26',
      '--pool-atomic', '-1',
      '--snapshot-block', '50413326',
    ])).toThrow('pool')
  })
})
