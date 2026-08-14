import { describe, expect, it, vi } from 'vitest'
import { launchBackgroundNetworkSync } from './background-sync.js'

describe('background network sync launcher', () => {
  it('starts a detached worker without putting the contributor token in process arguments', () => {
    const unref = vi.fn()
    const spawnImpl = vi.fn(() => ({ unref }))
    const token = `pln_${'a'.repeat(43)}`

    const launched = launchBackgroundNetworkSync({
      registration: { api_url: 'https://api.test', token, registered_at: '2026-08-13T00:00:00Z' },
      spawnImpl,
      execPath: '/usr/bin/node',
      workerPath: '/package/dist/main.js',
    })

    expect(launched).toBe(true)
    expect(spawnImpl).toHaveBeenCalledWith(
      '/usr/bin/node',
      ['/package/dist/main.js', '_sync-network-outbox'],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    )
    expect(JSON.stringify(spawnImpl.mock.calls)).not.toContain(token)
    expect(unref).toHaveBeenCalledOnce()
  })

  it('does nothing until the installation has joined the network', () => {
    const spawnImpl = vi.fn()
    expect(launchBackgroundNetworkSync({ registration: null, spawnImpl })).toBe(false)
    expect(spawnImpl).not.toHaveBeenCalled()
  })
})
