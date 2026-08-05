import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { hasValidWalletBinding } from './db.js'

const account = privateKeyToAccount(`0x${'22'.repeat(32)}`)

describe('payout wallet binding', () => {
  it('accepts only the exact contributor and wallet signed by the account', async () => {
    const contributorId = 'brian-primary'
    const signature = await account.signMessage({ message: `pollen:register:${contributorId}` })

    await expect(hasValidWalletBinding(contributorId, account.address, signature)).resolves.toBe(true)
    await expect(hasValidWalletBinding('another-contributor', account.address, signature)).resolves.toBe(false)
    await expect(hasValidWalletBinding(contributorId, '0x0000000000000000000000000000000000000001', signature)).resolves.toBe(false)
  })
})
