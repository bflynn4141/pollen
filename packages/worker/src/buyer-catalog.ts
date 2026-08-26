import { K_ANONYMITY } from '@pollen/data'

export const PAID_RESOURCES = {
  '/tools/history': {
    template: '/tools/history?tool=<name>',
    amount: '10000',
    priceUsd: '0.01',
    description: 'Full weekly history for one tool',
    response: '{ k_anonymity, tool, history: [{ week, calls, sessions, successRate, contributors }] }',
  },
  '/mcp/history': {
    template: '/mcp/history?server=<name>',
    amount: '10000',
    priceUsd: '0.01',
    description: 'Full weekly history for one public MCP server',
    response: '{ k_anonymity, server, history: [{ week, calls, sessions, successRate, contributors }] }',
  },
  '/grid': {
    template: '/grid',
    amount: '50000',
    priceUsd: '0.05',
    description: 'Full tool-by-week and MCP-server-by-week grid',
    response: '{ k_anonymity, tools: [rollupCell], mcpServers: [rollupCell] }',
  },
  '/export': {
    template: '/export',
    amount: '250000',
    priceUsd: '0.25',
    description: 'Every published privacy-safe rollup cell',
    response: '{ k_anonymity, count, cells: [rollupCell] }',
  },
} as const

export type PaidResourcePath = keyof typeof PAID_RESOURCES

export function paidResource(path: string): { path: PaidResourcePath; resource: typeof PAID_RESOURCES[PaidResourcePath] } | null {
  const canonical = path.startsWith('/api/v1/') ? path.slice('/api/v1'.length) : path
  if (!(canonical in PAID_RESOURCES)) return null
  const resourcePath = canonical as PaidResourcePath
  return { path: resourcePath, resource: PAID_RESOURCES[resourcePath] }
}

export function createBuyerCatalog(origin: string) {
  const apiOrigin = origin.replace(/\/$/, '')
  return {
    service: 'Pollen Prompt Intelligence',
    version: '2026-08-26',
    x402Version: 2,
    network: 'eip155:8453',
    settlementAsset: 'USDC',
    dataProduct: {
      description: 'Aggregated, privacy-safe intelligence derived from human contributor activity in AI coding agents.',
      includedSignals: [
        'coarse intent',
        'agent and model',
        'tool-category sequence',
        'public MCP server and tool identifiers',
        'duration, terminal state, check result, and latency buckets',
      ],
      excludedSignals: [
        'prompt text',
        'tool arguments or results',
        'source code',
        'file paths',
        'shell output',
        'credentials',
      ],
      provenance: 'Opt-in Pollen CLI installations submit a closed receipt schema. Public endpoints read only precomputed rollups.',
    },
    privacy: {
      minimumContributorsPerCell: K_ANONYMITY,
      enforcement: 'Cells below the minimum cohort are suppressed before publication.',
      belowThresholdBehavior: 'Free previews report warming_up with empty public windows. Paid queries with no published rows return a non-success response and are not settled.',
    },
    freshness: {
      rollupSchedule: 'Every 15 minutes',
      timeZone: 'UTC',
      history: 'Weekly cells outside the rolling recompute window are frozen.',
    },
    freePreviews: [
      { url: `${apiOrigin}/network`, description: 'Prompt-intelligence market snapshot and cohort readiness' },
      { url: `${apiOrigin}/trending/tools`, description: 'Latest two published tool weeks' },
      { url: `${apiOrigin}/trending/mcp`, description: 'Latest two published MCP weeks' },
      { url: `${apiOrigin}/overview`, description: 'Latest published network totals' },
    ],
    paidResources: Object.entries(PAID_RESOURCES).map(([path, resource]) => ({
      method: 'GET',
      path: resource.template,
      url: `${apiOrigin}${resource.template}`,
      priceUsd: resource.priceUsd,
      amountAtomicUsdc: resource.amount,
      description: resource.description,
      response: resource.response,
      cache: 'no-store',
    })),
    wireProtocol: {
      challengeHeader: 'PAYMENT-REQUIRED',
      authorizationHeader: 'PAYMENT-SIGNATURE',
      settlementHeader: 'PAYMENT-RESPONSE',
    },
  }
}

export function unpublishedPaidResult(resource: string) {
  return {
    status: 'warming_up',
    charged: false,
    error: `No privacy-qualified published rows are available for ${resource}.`,
    minimum_contributors: K_ANONYMITY,
    preview: '/network',
  }
}
