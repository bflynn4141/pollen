import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createPollenPaymentMiddleware, type PaymentRelayer } from './x402-relay'

const SETTLEMENT = '0x4548475CA9EE1BEff99fFfa3b691815388B1E139'
const PAYER = '0x9C87d52543A57B1a02eeD0497D43bDb87D0B175c'

function paymentHeader(to = SETTLEMENT, value = '50000'): string {
  return btoa(
    JSON.stringify({
      x402Version: 1,
      scheme: 'exact',
      network: 'base',
      payload: {
        signature: `0x${'11'.repeat(65)}`,
        authorization: {
          from: PAYER,
          to,
          value,
          validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1000) + 60),
          nonce: `0x${'22'.repeat(32)}`,
        },
      },
    }),
  )
}

function smartWalletPaymentHeader(): string {
  const decoded = JSON.parse(atob(paymentHeader()))
  decoded.payload.signature = `0x${'11'.repeat(66)}`
  return btoa(JSON.stringify(decoded))
}

function testApp(relayer: PaymentRelayer) {
  const app = new Hono()
  app.use('*', createPollenPaymentMiddleware(relayer))
  app.get('/grid', c => c.json({ ok: true }))
  app.get('/api/v1/grid', c => c.json({ ok: true }))
  return app
}

const env = {
  X402_PAY_TO: SETTLEMENT,
  X402_RELAYER_KEY: `0x${'33'.repeat(32)}`,
}

describe('Pollen x402 Base relayer', () => {
  it('returns a Base-mainnet 402 challenge addressed to PollenSettlementV2', async () => {
    const app = testApp({ verify: vi.fn(), settle: vi.fn() })
    const response = await app.request('/grid', {}, env)
    const body = await response.json() as any

    expect(response.status).toBe(402)
    expect(body.accepts[0]).toMatchObject({
      network: 'base',
      maxAmountRequired: '50000',
      payTo: SETTLEMENT,
    })
  })

  it('fails closed when the relayer configuration is missing', async () => {
    const app = testApp({ verify: vi.fn(), settle: vi.fn() })
    const response = await app.request('/grid', {}, {})

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'x402 settlement is not configured' })
  })

  it('rejects a payment signed for another recipient', async () => {
    const relayer = { verify: vi.fn(), settle: vi.fn() }
    const app = testApp(relayer)
    const response = await app.request('/grid', {
      headers: { 'X-PAYMENT': paymentHeader(PAYER) },
    }, env)

    expect(response.status).toBe(402)
    expect(relayer.verify).not.toHaveBeenCalled()
    expect(relayer.settle).not.toHaveBeenCalled()
  })

  it('serves both route prefixes and returns the settlement receipt', async () => {
    const relayer: PaymentRelayer = {
      verify: vi.fn().mockResolvedValue({ isValid: true, payer: PAYER }),
      settle: vi.fn().mockResolvedValue({
        success: true,
        payer: PAYER,
        transaction: `0x${'44'.repeat(32)}`,
        network: 'base',
      }),
    }
    const app = testApp(relayer)

    for (const path of ['/grid', '/api/v1/grid']) {
      const response = await app.request(path, {
        headers: { 'X-PAYMENT': paymentHeader() },
      }, env)
      expect(response.status).toBe(200)
      expect(response.headers.get('X-PAYMENT-RESPONSE')).toBeTruthy()
    }
    expect(relayer.verify).toHaveBeenCalledTimes(2)
    expect(relayer.settle).toHaveBeenCalledTimes(2)
  })

  it('does not settle when the protected handler fails', async () => {
    const relayer: PaymentRelayer = {
      verify: vi.fn().mockResolvedValue({ isValid: true, payer: PAYER }),
      settle: vi.fn(),
      release: vi.fn(),
    }
    const app = new Hono()
    app.use('*', createPollenPaymentMiddleware(relayer))
    app.get('/grid', c => c.json({ error: 'query failed' }, 500))

    const response = await app.request('/grid', {
      headers: { 'X-PAYMENT': paymentHeader() },
    }, env)

    expect(response.status).toBe(500)
    expect(relayer.settle).not.toHaveBeenCalled()
    expect(relayer.release).toHaveBeenCalledOnce()
  })

  it('rejects unsupported smart-wallet signatures before protected work', async () => {
    const relayer: PaymentRelayer = {
      verify: vi.fn().mockResolvedValue({ isValid: true, payer: PAYER }),
      settle: vi.fn(),
    }
    const handler = vi.fn()
    const app = new Hono()
    app.use('*', createPollenPaymentMiddleware(relayer))
    app.get('/grid', c => {
      handler()
      return c.json({ ok: true })
    })

    const response = await app.request('/grid', {
      headers: { 'X-PAYMENT': smartWalletPaymentHeader() },
    }, env)

    expect(response.status).toBe(402)
    expect(handler).not.toHaveBeenCalled()
    expect(relayer.verify).not.toHaveBeenCalled()
    expect(relayer.settle).not.toHaveBeenCalled()
  })
})
