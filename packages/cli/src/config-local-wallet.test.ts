import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const ADDRESS = '0x1111111111111111111111111111111111111111'
const SIGNATURE = `0x${'22'.repeat(65)}`
const previousHome = process.env.HOME

afterEach(() => {
  process.env.HOME = previousHome
  vi.doUnmock('./local-wallet.js')
  vi.doUnmock('./wallet-bind.js')
  vi.resetModules()
})

async function loadSubject(submit: () => Promise<void>) {
  const home = mkdtempSync(join(tmpdir(), 'pollen-config-local-'))
  process.env.HOME = home
  vi.resetModules()
  vi.doMock('./local-wallet.js', () => ({
    getOrCreateLocalWallet: vi.fn(async () => ({
      address: ADDRESS,
      signature: SIGNATURE,
      created: true,
      walletPath: join(home, '.pollen', 'local-wallet.json'),
    })),
  }))
  vi.doMock('./wallet-bind.js', () => ({ submitWalletBinding: vi.fn(submit) }))
  const config = await import('./config.js')
  config.saveConfig({ contributor_id: 'contributor-1' })
  return { config, home }
}

describe('setupLocalWallet', () => {
  it('persists only public wallet data after the server accepts the binding', async () => {
    const { config, home } = await loadSubject(async () => {})
    await expect(config.setupLocalWallet()).resolves.toEqual({ address: ADDRESS, type: 'local' })
    const stored = readFileSync(join(home, '.pollen', 'config.json'), 'utf8')
    expect(stored).toContain(ADDRESS)
    expect(stored).toContain(SIGNATURE)
    expect(stored).not.toContain('private_key')
    expect(config.getWalletAddress()).toBe(ADDRESS)
  })

  it('leaves contributor config unchanged when remote binding fails', async () => {
    const { config, home } = await loadSubject(async () => { throw new Error('wallet_mismatch') })
    await expect(config.setupLocalWallet()).rejects.toThrow('wallet_mismatch')
    const stored = JSON.parse(readFileSync(join(home, '.pollen', 'config.json'), 'utf8'))
    expect(stored).toEqual({ contributor_id: 'contributor-1' })
  })
})
