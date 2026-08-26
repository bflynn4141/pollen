import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { x402Client } from '@x402/core/client'
import {
  decodePaymentRequiredHeader,
  encodePaymentSignatureHeader,
} from '@x402/core/http'
import { ExactEvmScheme as ExactEvmClientScheme } from '@x402/evm/exact/client'
import { privateKeyToAccount } from 'viem/accounts'
import { createPollenPaymentMiddleware, type PaymentRelayer } from './x402-relay'

const SETTLEMENT = '0x4548475CA9EE1BEff99fFfa3b691815388B1E139'
const PAYER = '0x9C87d52543A57B1a02eeD0497D43bDb87D0B175c'

function paymentHeader(to = SETTLEMENT, value = '50000'): string {
  return btoa(
    JSON.stringify({
      x402Version: 2,
      resource: {
        url: 'http://localhost/grid',
        description: 'Full tool x week and MCP-server x week grid, all published history',
        mimeType: 'application/json',
      },
      accepted: {
        scheme: 'exact',
        network: 'eip155:8453',
        amount: '50000',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        payTo: to,
        maxTimeoutSeconds: 60,
        extra: { name: 'USDC', version: '2' },
      },
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
      extensions: {},
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
    expect(body.x402Version).toBe(2)
    expect(body.accepts[0]).toMatchObject({
      network: 'eip155:8453',
      amount: '50000',
      payTo: SETTLEMENT,
    })
    const encodedChallenge = response.headers.get('PAYMENT-REQUIRED')
    expect(encodedChallenge).toBeTruthy()
    expect(JSON.parse(atob(encodedChallenge!))).toEqual(body)
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
      headers: { 'PAYMENT-SIGNATURE': paymentHeader(PAYER) },
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
        network: 'eip155:8453',
      }),
    }
    const app = testApp(relayer)

    for (const path of ['/grid', '/api/v1/grid']) {
      const response = await app.request(path, {
        headers: { 'PAYMENT-SIGNATURE': paymentHeader() },
      }, env)
      expect(response.status).toBe(200)
      const encodedReceipt = response.headers.get('PAYMENT-RESPONSE')
      expect(encodedReceipt).toBeTruthy()
      expect(JSON.parse(atob(encodedReceipt!))).toMatchObject({
        success: true,
        network: 'eip155:8453',
      })
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
      headers: { 'PAYMENT-SIGNATURE': paymentHeader() },
    }, env)

    expect(response.status).toBe(500)
    expect(relayer.settle).not.toHaveBeenCalled()
    expect(relayer.release).toHaveBeenCalledOnce()
  })

  it('does not settle an unpublished result below the privacy threshold', async () => {
    const relayer: PaymentRelayer = {
      verify: vi.fn().mockResolvedValue({ isValid: true, payer: PAYER }),
      settle: vi.fn(),
      release: vi.fn(),
    }
    const app = new Hono()
    app.use('*', createPollenPaymentMiddleware(relayer))
    app.get('/grid', c => c.json({
      status: 'warming_up',
      charged: false,
      minimum_contributors: 5,
    }, 425))

    const response = await app.request('/grid', {
      headers: { 'PAYMENT-SIGNATURE': paymentHeader() },
    }, env)

    expect(response.status).toBe(425)
    expect(await response.json()).toMatchObject({ charged: false, minimum_contributors: 5 })
    expect(relayer.settle).not.toHaveBeenCalled()
    expect(relayer.release).toHaveBeenCalledOnce()
    expect(response.headers.get('PAYMENT-RESPONSE')).toBeNull()
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
      headers: { 'PAYMENT-SIGNATURE': smartWalletPaymentHeader() },
    }, env)

    expect(response.status).toBe(402)
    expect(handler).not.toHaveBeenCalled()
    expect(relayer.verify).not.toHaveBeenCalled()
    expect(relayer.settle).not.toHaveBeenCalled()
  })

  it('does not accept a legacy v1 X-PAYMENT header', async () => {
    const relayer = { verify: vi.fn(), settle: vi.fn() }
    const app = testApp(relayer)
    const response = await app.request('/grid', {
      headers: { 'X-PAYMENT': paymentHeader() },
    }, env)

    expect(response.status).toBe(402)
    expect((await response.json() as any).error).toContain('PAYMENT-SIGNATURE')
    expect(relayer.verify).not.toHaveBeenCalled()
  })

  it('rejects overpayment because the exact scheme requires an exact amount', async () => {
    const relayer = { verify: vi.fn(), settle: vi.fn() }
    const app = testApp(relayer)
    const response = await app.request('/grid', {
      headers: { 'PAYMENT-SIGNATURE': paymentHeader(SETTLEMENT, '50001') },
    }, env)

    expect(response.status).toBe(402)
    expect(relayer.verify).not.toHaveBeenCalled()
    expect(relayer.settle).not.toHaveBeenCalled()
  })

  it('completes the v2 challenge/sign/retry handshake with the official client SDK', async () => {
    const payer = privateKeyToAccount(`0x${'55'.repeat(32)}`)
    const relayer: PaymentRelayer = {
      verify: vi.fn().mockImplementation(async (_env, payment, requirements) => ({
        isValid: payment.x402Version === 2
          && payment.accepted.network === 'eip155:8453'
          && payment.payload.authorization.from === payer.address
          && payment.payload.authorization.value === requirements.amount,
        payer: payment.payload.authorization.from,
      })),
      settle: vi.fn().mockResolvedValue({
        success: true,
        payer: payer.address,
        transaction: `0x${'66'.repeat(32)}`,
        network: 'eip155:8453',
      }),
    }
    const app = testApp(relayer)

    const challengeResponse = await app.request('/grid', {}, env)
    const paymentRequired = decodePaymentRequiredHeader(
      challengeResponse.headers.get('PAYMENT-REQUIRED')!,
    )
    const client = new x402Client().register(
      'eip155:8453',
      new ExactEvmClientScheme(payer),
    )
    const payment = await client.createPaymentPayload(paymentRequired)
    const paidResponse = await app.request('/grid', {
      headers: { 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payment) },
    }, env)

    expect(paidResponse.status).toBe(200)
    expect(await paidResponse.json()).toEqual({ ok: true })
    expect(paidResponse.headers.get('PAYMENT-RESPONSE')).toBeTruthy()
    expect(relayer.verify).toHaveBeenCalledOnce()
    expect(relayer.settle).toHaveBeenCalledOnce()
  })
})
