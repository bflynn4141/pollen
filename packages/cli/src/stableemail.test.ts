import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendEmail, StableEmailError } from './stableemail.js'
import { USDC_BASE } from './x402.js'

const TEST_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const
// All-lowercase so viem skips checksum validation
const PAY_TO = `0x${'ab'.repeat(20)}`

const MESSAGE = {
  to: ['test@example.com'],
  subject: 'Pollen Brief',
  html: '<p>hi</p>',
  text: 'hi',
}

function challenge402(): Response {
  return new Response(JSON.stringify({
    accepts: [{
      scheme: 'exact',
      network: 'base',
      payTo: PAY_TO,
      maxAmountRequired: '20000', // $0.02 in USDC units
      asset: USDC_BASE,
      extra: { name: 'USD Coin', version: '2' },
    }],
  }), { status: 402 })
}

describe('sendEmail x402 flow', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('402 challenge → signed retry with X-PAYMENT → success', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(challenge402())
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'msg_123' }), { status: 200 }))

    const receipt = await sendEmail(MESSAGE, { fetchFn: fetchFn as unknown as typeof fetch, privateKey: TEST_KEY })

    expect(receipt.id).toBe('msg_123')
    expect(receipt.paidUsd).toBe('0.02')
    expect(fetchFn).toHaveBeenCalledTimes(2)

    // First call is unpaid
    const firstHeaders = (fetchFn.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(firstHeaders['X-PAYMENT']).toBeUndefined()

    // Second call carries a well-formed x402 payment envelope
    const secondInit = fetchFn.mock.calls[1][1] as RequestInit
    const headers = secondInit.headers as Record<string, string>
    expect(headers['X-PAYMENT']).toBeDefined()
    const envelope = JSON.parse(Buffer.from(headers['X-PAYMENT'], 'base64').toString('utf-8'))
    expect(envelope.x402Version).toBe(1)
    expect(envelope.scheme).toBe('exact')
    expect(envelope.network).toBe('base')
    expect(envelope.payload.signature).toMatch(/^0x[0-9a-f]+$/i)
    expect(envelope.payload.authorization.to).toBe(PAY_TO)
    expect(envelope.payload.authorization.value).toBe('20000')
    expect(envelope.payload.authorization.nonce).toMatch(/^0x[0-9a-f]{64}$/)
    // Body is the same email message on both calls
    expect(JSON.parse(secondInit.body as string)).toEqual(MESSAGE)
  })

  it('double 402 → unfunded error', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(challenge402())
      .mockResolvedValueOnce(challenge402())

    await expect(sendEmail(MESSAGE, { fetchFn: fetchFn as unknown as typeof fetch, privateKey: TEST_KEY }))
      .rejects.toMatchObject({ name: 'StableEmailError', code: 'unfunded' })
  })

  it('missing key → clear no_key error (after seeing the 402)', async () => {
    delete process.env.POLLEN_X402_KEY
    delete process.env.POLLEN_DEMO_KEY
    const fetchFn = vi.fn().mockResolvedValueOnce(challenge402())

    await expect(sendEmail(MESSAGE, { fetchFn: fetchFn as unknown as typeof fetch }))
      .rejects.toMatchObject({ code: 'no_key' })
    // Never retried without a signature
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('falls back to POLLEN_DEMO_KEY when POLLEN_X402_KEY is unset', async () => {
    delete process.env.POLLEN_X402_KEY
    vi.stubEnv('POLLEN_DEMO_KEY', TEST_KEY)
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(challenge402())
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'msg_9' }), { status: 200 }))

    const receipt = await sendEmail(MESSAGE, { fetchFn: fetchFn as unknown as typeof fetch })
    expect(receipt.id).toBe('msg_9')
  })

  it('non-402 upstream failure → http error', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('boom', { status: 500 }))
    await expect(sendEmail(MESSAGE, { fetchFn: fetchFn as unknown as typeof fetch, privateKey: TEST_KEY }))
      .rejects.toMatchObject({ code: 'http' })
  })

  it('network failure → network error', async () => {
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'))
    await expect(sendEmail(MESSAGE, { fetchFn: fetchFn as unknown as typeof fetch, privateKey: TEST_KEY }))
      .rejects.toMatchObject({ code: 'network' })
  })

  it('unusable challenge → bad_challenge error', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      accepts: [{ scheme: 'exact', network: 'ethereum', payTo: PAY_TO, maxAmountRequired: '1' }],
    }), { status: 402 }))
    await expect(sendEmail(MESSAGE, { fetchFn: fetchFn as unknown as typeof fetch, privateKey: TEST_KEY }))
      .rejects.toMatchObject({ code: 'bad_challenge' })
  })

  it('free pass (200 on first attempt) skips payment entirely', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'free_1' }), { status: 200 }))
    const receipt = await sendEmail(MESSAGE, { fetchFn: fetchFn as unknown as typeof fetch, privateKey: TEST_KEY })
    expect(receipt.id).toBe('free_1')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('StableEmailError carries a helpful message for no_key', async () => {
    delete process.env.POLLEN_X402_KEY
    delete process.env.POLLEN_DEMO_KEY
    const fetchFn = vi.fn().mockResolvedValueOnce(challenge402())
    try {
      await sendEmail(MESSAGE, { fetchFn: fetchFn as unknown as typeof fetch })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(StableEmailError)
      expect((err as Error).message).toContain('POLLEN_X402_KEY')
      expect((err as Error).message).toContain('$0.02')
    }
  })
})
