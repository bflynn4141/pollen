import { describe, expect, it, vi } from 'vitest'
import {
  handleContributorRegistration,
  handleReceiptIngest,
  validateNetworkReceipt,
  type IngestDependencies,
} from './ingest'

const validReceipt = {
  schema_version: 1,
  receipt_id: '2b92eeda-e523-4dd8-b65a-0cf2f272e221',
  observed_at: Date.UTC(2026, 7, 12, 12),
  intent: 'feature_build',
  agent: 'codex',
  model: 'gpt-5.2-codex',
  tool_category_sequence: ['read', 'write', 'execute'],
  duration_bucket: 'medium',
  terminal_state: 'completed',
  check_result: 'passed',
}

function dependencies(overrides: Partial<IngestDependencies> = {}): IngestDependencies {
  return {
    registerContributor: vi.fn(async () => undefined),
    authenticateTokenHash: vi.fn(async () => 'contributor-1'),
    insertReceipts: vi.fn(async () => 1),
    ...overrides,
  }
}

describe('network receipt validation', () => {
  it('accepts the closed, coarsened v1 schema', () => {
    expect(validateNetworkReceipt(validReceipt)).toEqual(validReceipt)
  })

  it.each(['prompt', 'tool_arguments', 'source_code', 'transcript_path', 'response_summary']) (
    'rejects the forbidden field %s',
    forbidden => {
      expect(() => validateNetworkReceipt({ ...validReceipt, [forbidden]: 'raw content' }))
        .toThrow('unknown field')
    },
  )
})

describe('receipt ingest handlers', () => {
  it('registers a pseudonymous contributor and returns a one-time token', async () => {
    const deps = dependencies()
    const response = await handleContributorRegistration(deps)
    const body = await response.json() as Record<string, string>

    expect(response.status).toBe(201)
    expect(body.contributor_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.token).toMatch(/^pln_[A-Za-z0-9_-]{43}$/)
    expect(deps.registerContributor).toHaveBeenCalledOnce()
    expect(deps.registerContributor).not.toHaveBeenCalledWith(expect.anything(), body.token)
  })

  it('requires an authenticated contributor token', async () => {
    const response = await handleReceiptIngest(
      new Request('https://api.pollen.test/api/v1/receipts', {
        method: 'POST',
        body: JSON.stringify({ receipts: [validReceipt] }),
      }),
      dependencies({ authenticateTokenHash: vi.fn(async () => null) }),
    )

    expect(response.status).toBe(401)
  })

  it('stores only validated receipts under the server-authenticated contributor', async () => {
    const deps = dependencies()
    const response = await handleReceiptIngest(
      new Request('https://api.pollen.test/api/v1/receipts', {
        method: 'POST',
        headers: {
          authorization: `Bearer pln_${'a'.repeat(43)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ receipts: [validReceipt] }),
      }),
      deps,
    )

    expect(response.status).toBe(202)
    expect(deps.insertReceipts).toHaveBeenCalledWith('contributor-1', [validReceipt])
  })
})
