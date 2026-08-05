import { describe, it, expect } from 'vitest'
import { chunk, MAX_RECIPIENTS_PER_TX } from './chunk.js'

describe('chunk', () => {
  it('defaults to the mintBatch recipient cap', () => {
    expect(MAX_RECIPIENTS_PER_TX).toBe(100)
    const items = Array.from({ length: 250 }, (_, i) => i)
    const chunks = chunk(items)
    expect(chunks.map(c => c.length)).toEqual([100, 100, 50])
    expect(chunks.flat()).toEqual(items)
  })

  it('returns one chunk when under the cap', () => {
    expect(chunk([1, 2, 3])).toEqual([[1, 2, 3]])
  })

  it('returns no chunks for an empty list', () => {
    expect(chunk([])).toEqual([])
  })

  it('splits exact multiples cleanly', () => {
    const chunks = chunk(Array.from({ length: 200 }, (_, i) => i))
    expect(chunks.map(c => c.length)).toEqual([100, 100])
  })

  it('honors a custom size and preserves order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('rejects a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow()
    expect(() => chunk([1], -5)).toThrow()
  })
})
