import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { verifyMessage } from 'viem'
import {
  decryptPrivateKey,
  encryptPrivateKey,
  getOrCreateLocalWallet,
  type LocalWalletKeychain,
} from './local-wallet.js'
import { registrationMessage } from './register-sign.js'

const PRIVATE_KEY = `0x${'11'.repeat(32)}` as const
const WRAPPING_KEY = Buffer.alloc(32, 7)

function memoryKeychain(): LocalWalletKeychain {
  const values = new Map<string, string>()
  return {
    get: (account) => values.get(account) ?? null,
    set: (account, secret) => { values.set(account, secret) },
  }
}

describe('local encrypted wallet', () => {
  it('round-trips a private key without storing it in plaintext', () => {
    const encrypted = encryptPrivateKey(PRIVATE_KEY, WRAPPING_KEY)
    expect(JSON.stringify(encrypted)).not.toContain(PRIVATE_KEY.slice(2))
    expect(decryptPrivateKey(encrypted, WRAPPING_KEY)).toBe(PRIVATE_KEY)
    expect(() => decryptPrivateKey(encrypted, Buffer.alloc(32, 8))).toThrow()
  })

  it('creates once, stores a 0600 ciphertext file, and signs the contributor binding', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pollen-local-wallet-'))
    const walletPath = join(dir, 'local-wallet.json')
    const keychain = memoryKeychain()
    const generate = vi.fn(() => PRIVATE_KEY)
    const contributorId = 'local-wallet-test'

    const first = await getOrCreateLocalWallet(contributorId, {
      walletPath,
      keychain,
      generatePrivateKey: generate,
    })
    const stored = readFileSync(walletPath, 'utf8')
    expect(stored).not.toContain(PRIVATE_KEY.slice(2))
    expect(statSync(walletPath).mode & 0o777).toBe(0o600)
    await expect(verifyMessage({
      address: first.address,
      message: registrationMessage(contributorId),
      signature: first.signature,
    })).resolves.toBe(true)

    const second = await getOrCreateLocalWallet(contributorId, {
      walletPath,
      keychain,
      generatePrivateKey: generate,
    })
    expect(second.address).toBe(first.address)
    expect(generate).toHaveBeenCalledOnce()
  })

  it('fails closed when ciphertext exists without its Keychain wrapping key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pollen-local-wallet-'))
    const walletPath = join(dir, 'local-wallet.json')
    const contributorId = 'missing-key-test'
    await getOrCreateLocalWallet(contributorId, {
      walletPath,
      keychain: memoryKeychain(),
      generatePrivateKey: () => PRIVATE_KEY,
    })

    await expect(getOrCreateLocalWallet(contributorId, {
      walletPath,
      keychain: memoryKeychain(),
      generatePrivateKey: () => { throw new Error('must not regenerate') },
    })).rejects.toThrow('Keychain')
  })
})
