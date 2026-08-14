import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  clearNetworkRegistration,
  loadConfig,
  saveConfig,
  setCapturePaused,
} from './config.js'

describe('contributor capture controls', () => {
  it('pauses and resumes without losing identity or network registration', () => {
    const home = mkdtempSync(join(tmpdir(), 'pollen-controls-'))
    const configPath = join(home, '.pollen', 'config.json')
    try {
      saveConfig({
        contributor_id: 'contributor-1',
        network: {
          api_url: 'https://api.test',
          token: `pln_${'a'.repeat(43)}`,
          registered_at: '2026-08-13T00:00:00Z',
        },
      }, configPath)

      setCapturePaused(true, configPath)
      expect(loadConfig(configPath)).toMatchObject({
        contributor_id: 'contributor-1',
        capture_paused: true,
        network: { api_url: 'https://api.test' },
      })
      setCapturePaused(false, configPath)
      expect(loadConfig(configPath)?.capture_paused).toBe(false)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('repairs an existing config directory to mode 0700 and config to 0600', () => {
    const home = mkdtempSync(join(tmpdir(), 'pollen-permissions-'))
    const pollenDir = join(home, '.pollen')
    const configPath = join(pollenDir, 'config.json')
    try {
      mkdirSync(pollenDir, { mode: 0o755 })
      writeFileSync(configPath, JSON.stringify({ contributor_id: 'contributor-1' }), { mode: 0o644 })
      chmodSync(pollenDir, 0o755)
      chmodSync(configPath, 0o644)

      saveConfig({ contributor_id: 'contributor-1' }, configPath)

      expect(statSync(pollenDir).mode & 0o777).toBe(0o700)
      expect(statSync(configPath).mode & 0o777).toBe(0o600)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('removes only network credentials after server-side deletion', () => {
    const home = mkdtempSync(join(tmpdir(), 'pollen-leave-'))
    const configPath = join(home, '.pollen', 'config.json')
    try {
      saveConfig({
        contributor_id: 'contributor-1',
        wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
        network: {
          api_url: 'https://api.test',
          token: `pln_${'a'.repeat(43)}`,
          registered_at: '2026-08-13T00:00:00Z',
        },
      }, configPath)

      clearNetworkRegistration(configPath)

      expect(loadConfig(configPath)).toEqual({
        contributor_id: 'contributor-1',
        wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
      })
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
