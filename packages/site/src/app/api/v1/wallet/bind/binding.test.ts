import { describe, expect, it, vi } from 'vitest'
import { claimWalletBinding } from './binding.js'

const ADDRESS = '0x1111111111111111111111111111111111111111'

describe('claimWalletBinding', () => {
  it('atomically claims an empty wallet slot or refreshes the same binding', async () => {
    const sql = vi.fn().mockResolvedValueOnce([{ wallet_address: ADDRESS }])
    await expect(claimWalletBinding(sql, 'contributor-1', ADDRESS, '0xsig')).resolves.toBe('bound')
    expect(sql).toHaveBeenCalledOnce()
    const statement = sql.mock.calls[0][0].join(' ')
    expect(statement).toContain('UPDATE contributors')
    expect(statement).toContain('wallet_address IS NULL')
    expect(statement).toContain('LOWER(wallet_address)')
  })

  it('distinguishes a missing contributor from an existing different wallet', async () => {
    const missingSql = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    await expect(claimWalletBinding(missingSql, 'missing', ADDRESS, '0xsig')).resolves.toBe('not_found')

    const mismatchSql = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ wallet_address: '0x2222222222222222222222222222222222222222' }])
    await expect(claimWalletBinding(mismatchSql, 'contributor-1', ADDRESS, '0xsig')).resolves.toBe('wallet_mismatch')
  })
})
