import { describe, expect, it, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { registrationMessage } from './register-sign.js'
import { isValidWalletBinding, submitWalletBinding } from './wallet-bind.js'

const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)

describe('wallet binding', () => {
  it('accepts only a signature from the registered wallet', async () => {
    const contributorId = 'brian-primary'
    const signature = await account.signMessage({ message: registrationMessage(contributorId) })
    await expect(isValidWalletBinding({
      contributor_id: contributorId,
      wallet_address: account.address,
      signature,
    })).resolves.toBe(true)
    await expect(isValidWalletBinding({
      contributor_id: 'someone-else',
      wallet_address: account.address,
      signature,
    })).resolves.toBe(false)
  })

  it('verifies locally before submitting the binding', async () => {
    const contributorId = 'brian-primary'
    const signature = await account.signMessage({ message: registrationMessage(contributorId) })
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    await submitWalletBinding({
      contributor_id: contributorId,
      wallet_address: account.address,
      signature,
    }, fetchMock)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
