import { describe, expect, it } from 'vitest'
import {
  createBuyerCatalog,
  paidResource,
  unpublishedPaidResult,
} from './buyer-catalog'

describe('buyer-facing data catalog', () => {
  it('advertises the exact x402 v2 wire contract and all paid routes', () => {
    const catalog = createBuyerCatalog('https://api.pollen.id/')

    expect(catalog.x402Version).toBe(2)
    expect(catalog.network).toBe('eip155:8453')
    expect(catalog.wireProtocol).toEqual({
      challengeHeader: 'PAYMENT-REQUIRED',
      authorizationHeader: 'PAYMENT-SIGNATURE',
      settlementHeader: 'PAYMENT-RESPONSE',
    })
    expect(catalog.paidResources.map(resource => resource.path)).toEqual([
      '/tools/history?tool=<name>',
      '/mcp/history?server=<name>',
      '/grid',
      '/export',
    ])
  })

  it('states the privacy boundary without offering prompt text', () => {
    const catalog = createBuyerCatalog('https://api.pollen.id')
    const serialized = JSON.stringify(catalog)

    expect(catalog.privacy.minimumContributorsPerCell).toBe(5)
    expect(catalog.dataProduct.excludedSignals).toContain('prompt text')
    expect(serialized).not.toContain('raw prompt access')
    expect(catalog.privacy.belowThresholdBehavior).toContain('not settled')
  })

  it('resolves both canonical and versioned paid route paths', () => {
    expect(paidResource('/grid')?.resource.amount).toBe('50000')
    expect(paidResource('/api/v1/export')?.resource.amount).toBe('250000')
    expect(paidResource('/network')).toBeNull()
  })

  it('marks empty paid results as uncharged without weakening k-anonymity', () => {
    expect(unpublishedPaidResult('grid')).toMatchObject({
      status: 'warming_up',
      charged: false,
      minimum_contributors: 5,
    })
  })
})
