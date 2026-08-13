import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createBridgeSession: vi.fn(),
  pollForProof: vi.fn(),
  verifyProof: vi.fn(),
}))

vi.mock('./config.js', () => ({
  loadConfig: vi.fn(() => null),
  saveConfig: vi.fn(),
  getOrCreateContributorId: vi.fn(() => 'contributor-test'),
}))

vi.mock('./worldid.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('./worldid.js')>(),
  createBridgeSession: mocks.createBridgeSession,
  pollForProof: mocks.pollForProof,
  verifyProof: mocks.verifyProof,
}))

vi.mock('qrcode-terminal', () => ({
  default: {
    generate: vi.fn((_uri: string, _opts: object, callback: (qr: string) => void) => callback('[qr]')),
  },
}))

describe('pollen verify World ID polling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createBridgeSession.mockResolvedValue({
      requestId: 'request-test',
      connectorURI: 'https://world.org/verify?t=wld&i=request-test',
      request: {},
    })
  })

  it('prints a recovery message and returns normally when the request expires', async () => {
    const error = Object.assign(new Error('World App error: timeout'), { code: 'timeout' })
    mocks.pollForProof.mockRejectedValue(error)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { runVerify } = await import('./verify.js')

    const result = await runVerify({ save: false })

    expect(result).toBe(false)
    expect(errorLog).toHaveBeenCalledWith(
      '✗ The verification link expired after 5 minutes. Run `pollen verify` again for a fresh link.',
    )
    expect(log).toHaveBeenCalledWith('Waiting for verification (5 min timeout)...\n')
    expect(mocks.verifyProof).not.toHaveBeenCalled()

    log.mockRestore()
    errorLog.mockRestore()
  })
})
