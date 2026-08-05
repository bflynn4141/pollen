import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

describe('World ID production configuration', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('fails closed before creating a request when production IDs are missing', async () => {
    delete process.env.WORLD_ID_APP_ID
    delete process.env.WORLD_ID_RP_ID
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { createBridgeSession } = await import('./worldid.js')

    await expect(createBridgeSession('brian-primary')).rejects.toThrow(
      'WORLD_ID_APP_ID and WORLD_ID_RP_ID',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loads IDKit file URLs locally instead of passing them to Node fetch', async () => {
    const fallback = vi.fn()
    const { fetchIdKitResource } = await import('./worldid.js')
    const entryUrl = pathToFileURL(createRequire(import.meta.url).resolve('@worldcoin/idkit-core'))
    const wasmUrl = new URL('idkit_wasm_bg.wasm', entryUrl)

    const response = await fetchIdKitResource(wasmUrl, undefined, fallback)

    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toBe('application/wasm')
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
    expect(fallback).not.toHaveBeenCalled()
  })
})
