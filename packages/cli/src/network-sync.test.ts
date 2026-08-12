import { describe, expect, it, vi } from 'vitest'
import { syncNetworkReceipts } from './network-sync.js'

describe('syncNetworkReceipts', () => {
  it('returns a friendly failure instead of throwing an API stack trace', async () => {
    const result = await syncNetworkReceipts({
      token: `pln_${'a'.repeat(43)}`,
      receipts: [],
      apiUrl: 'https://api.test',
      upload: vi.fn(async () => {
        throw new Error('invalid\nmodel')
      }),
    })

    expect(result).toEqual({
      ok: false,
      message: 'Could not sync receipts: invalid model',
    })
  })

  it('preserves accepted and idempotent receipt counts on success', async () => {
    const result = await syncNetworkReceipts({
      token: `pln_${'a'.repeat(43)}`,
      receipts: [],
      apiUrl: 'https://api.test',
      upload: vi.fn(async () => ({ accepted: 1, received: 3 })),
    })

    expect(result).toEqual({ ok: true, accepted: 1, received: 3 })
  })
})
