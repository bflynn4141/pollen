import { describe, expect, it } from 'vitest'
import { coarsenDepth } from './session.js'

describe('coarsenDepth', () => {
  it('returns first for prompt index 1', () => {
    expect(coarsenDepth(1)).toBe('first')
  })

  it('returns early for prompt index 2-5', () => {
    expect(coarsenDepth(2)).toBe('early')
    expect(coarsenDepth(5)).toBe('early')
  })

  it('returns mid for prompt index 6-15', () => {
    expect(coarsenDepth(6)).toBe('mid')
    expect(coarsenDepth(15)).toBe('mid')
  })

  it('returns deep for prompt index 16+', () => {
    expect(coarsenDepth(16)).toBe('deep')
    expect(coarsenDepth(100)).toBe('deep')
  })

  it('handles zero as first', () => {
    expect(coarsenDepth(0)).toBe('first')
  })
})
