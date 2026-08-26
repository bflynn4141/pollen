import { describe, expect, it, vi } from 'vitest'
import {
  handleContributorRegistration,
  handleContributorDeletion,
  handleContributorStatus,
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

const validReceiptV2 = {
  ...validReceipt,
  schema_version: 2,
  mcp_calls: [
    {
      server: 'github',
      tool: 'create_issue',
      success: true,
      latency_bucket: 'fast',
    },
  ],
}

const validReceiptV3 = {
  ...validReceiptV2,
  schema_version: 3,
  token_usage: {
    input_tokens: 12000,
    output_tokens: 800,
    cached_input_tokens: 9000,
    reasoning_tokens: 250,
  },
}

const validReceiptV4 = {
  ...validReceiptV3,
  schema_version: 4,
  mcp_calls: [{
    ...validReceiptV2.mcp_calls[0],
    input_tokens: 600,
    output_tokens: 40,
    cached_input_tokens: 300,
    reasoning_tokens: 10,
  }],
  tool_attributions: validReceipt.tool_category_sequence.map((category, index) => ({
    category,
    input_tokens: index === 2 ? 600 : null,
    output_tokens: index === 2 ? 40 : null,
    cached_input_tokens: index === 2 ? 300 : null,
    reasoning_tokens: index === 2 ? 10 : null,
  })),
}

function dependencies(overrides: Partial<IngestDependencies> = {}): IngestDependencies {
  return {
    registerContributor: vi.fn(async () => true),
    authenticateTokenHash: vi.fn(async () => 'contributor-1'),
    insertReceipts: vi.fn(async () => ({ accepted: 1, limited: false })),
    deleteContributor: vi.fn(async () => 'contributor-1'),
    ...overrides,
  }
}

describe('network receipt validation', () => {
  it('accepts the closed, coarsened v1 schema', () => {
    expect(validateNetworkReceipt(validReceipt)).toEqual(validReceipt)
  })

  it('accepts closed MCP call summaries in the v2 schema', () => {
    expect(validateNetworkReceipt(validReceiptV2)).toEqual(validReceiptV2)
  })

  it('accepts numeric-only token aggregates in the v3 schema', () => {
    expect(validateNetworkReceipt(validReceiptV3)).toEqual(validReceiptV3)
  })

  it('accepts response-attributed tool tokens in the v4 schema', () => {
    expect(validateNetworkReceipt(validReceiptV4)).toEqual(validReceiptV4)
  })

  it('rejects content and invalid token subsets in v4 tool attribution', () => {
    expect(() => validateNetworkReceipt({
      ...validReceiptV4,
      tool_attributions: [{ ...validReceiptV4.tool_attributions[0], arguments: 'private' }],
    })).toThrow()
    expect(() => validateNetworkReceipt({
      ...validReceiptV4,
      mcp_calls: [{ ...validReceiptV4.mcp_calls[0], cached_input_tokens: 700 }],
    })).toThrow()
  })

  it.each([
    { ...validReceiptV3.token_usage, input_tokens: -1 },
    { ...validReceiptV3.token_usage, output_tokens: 1.5 },
    { ...validReceiptV3.token_usage, cached_input_tokens: 20_000 },
    { ...validReceiptV3.token_usage, transcript_path: '/private/transcript.jsonl' },
  ])('rejects unsafe token usage data %#', tokenUsage => {
    expect(() => validateNetworkReceipt({ ...validReceiptV3, token_usage: tokenUsage }))
      .toThrow()
  })

  it.each([
    { server: 'internal customer', tool: 'lookup', success: true, latency_bucket: 'fast' },
    { server: 'github', tool: 'create_issue', success: true, latency_bucket: 'precise:820ms' },
    { server: 'github', tool: 'create_issue', success: true, latency_bucket: 'fast', arguments: '{}' },
    { server: 'github', tool: 'create_issue', success: true, latency_bucket: 'fast', icon_url: 'https://tracker.test/icon' },
  ])('rejects unsafe MCP call data %#', mcpCall => {
    expect(() => validateNetworkReceipt({ ...validReceiptV2, mcp_calls: [mcpCall] }))
      .toThrow()
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
  it('atomically consumes a single-use invite and returns a one-time token', async () => {
    const deps = dependencies()
    const response = await handleContributorRegistration(`pinv_${'a'.repeat(43)}`, deps)
    const body = await response.json() as Record<string, string>

    expect(response.status).toBe(201)
    expect(body.contributor_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.token).toMatch(/^pln_[A-Za-z0-9_-]{43}$/)
    expect(deps.registerContributor).toHaveBeenCalledOnce()
    expect(deps.registerContributor).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      body.contributor_id,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    )
    expect(deps.registerContributor).not.toHaveBeenCalledWith(
      expect.stringContaining('pinv_'),
      expect.anything(),
      expect.anything(),
    )
  })

  it('can attach an invite to a legacy contributor that has no network token', async () => {
    const deps = dependencies()
    const contributorId = 'brian-primary'
    const response = await handleContributorRegistration(`pinv_${'c'.repeat(43)}`, deps, contributorId)
    const body = await response.json() as Record<string, string>

    expect(response.status).toBe(201)
    expect(body.contributor_id).toBe(contributorId)
    expect(deps.registerContributor).toHaveBeenCalledWith(
      expect.any(String),
      contributorId,
      expect.any(String),
    )
  })

  it('rejects an invalid, used, expired, or revoked invite without issuing credentials', async () => {
    const registerContributor = vi.fn(async () => false)
    const response = await handleContributorRegistration(
      `pinv_${'b'.repeat(43)}`,
      dependencies({ registerContributor }),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'invalid_invite' })
  })

  it('rejects malformed invite codes before touching the database', async () => {
    const registerContributor = vi.fn(async () => true)
    const response = await handleContributorRegistration(
      'shared-founding-panel-code',
      dependencies({ registerContributor }),
    )

    expect(response.status).toBe(403)
    expect(registerContributor).not.toHaveBeenCalled()
  })

  it('rejects malformed legacy contributor ids before touching the database', async () => {
    const registerContributor = vi.fn(async () => true)
    const response = await handleContributorRegistration(
      `pinv_${'a'.repeat(43)}`,
      dependencies({ registerContributor }),
      'not a valid id',
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'invalid_contributor_id' })
    expect(registerContributor).not.toHaveBeenCalled()
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

  it('reports whether the locally stored contributor token is active', async () => {
    const response = await handleContributorStatus(
      new Request('https://api.pollen.test/api/v1/contributors/me', {
        headers: { authorization: `Bearer pln_${'a'.repeat(43)}` },
      }),
      dependencies({ authenticateTokenHash: vi.fn(async () => 'contributor-1') }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ contributor_id: 'contributor-1', status: 'active' })
  })

  it('deletes the authenticated contributor and all cascade-owned data', async () => {
    const deps = dependencies()
    const response = await handleContributorDeletion(
      new Request('https://api.pollen.test/api/v1/contributors/me', {
        method: 'DELETE',
        headers: { authorization: `Bearer pln_${'a'.repeat(43)}` },
      }),
      deps,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: true })
    expect(deps.deleteContributor).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/))
  })

  it('does not reveal whether an invalid or already-revoked deletion token existed', async () => {
    const response = await handleContributorDeletion(
      new Request('https://api.pollen.test/api/v1/contributors/me', {
        method: 'DELETE',
        headers: { authorization: `Bearer pln_${'a'.repeat(43)}` },
      }),
      dependencies({ deleteContributor: vi.fn(async () => null) }),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
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

  it('stores validated v2 MCP summaries under the authenticated contributor', async () => {
    const deps = dependencies()
    const response = await handleReceiptIngest(
      new Request('https://api.pollen.test/api/v1/receipts', {
        method: 'POST',
        headers: {
          authorization: `Bearer pln_${'a'.repeat(43)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ receipts: [validReceiptV2] }),
      }),
      deps,
    )

    expect(response.status).toBe(202)
    expect(deps.insertReceipts).toHaveBeenCalledWith('contributor-1', [validReceiptV2])
  })

  it('rate-limits a contributor after the daily receipt quota is exhausted', async () => {
    const response = await handleReceiptIngest(
      new Request('https://api.pollen.test/api/v1/receipts', {
        method: 'POST',
        headers: {
          authorization: `Bearer pln_${'a'.repeat(43)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ receipts: [validReceipt] }),
      }),
      dependencies({
        insertReceipts: vi.fn(async () => ({ accepted: 0, limited: true })),
      }),
    )

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({
      error: 'rate_limited',
      accepted: 0,
      received: 1,
    })
  })
})
