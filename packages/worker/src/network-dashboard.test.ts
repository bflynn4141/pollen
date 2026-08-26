import { describe, expect, it, vi } from 'vitest'
import {
  buildNetworkDashboard,
  fetchNetworkDashboard,
  selectDashboard,
  type NetworkApiResponse,
  type NetworkPeriodSnapshot,
} from '../../site/src/lib/network-dashboard'
import { buildPersonalDashboard } from '../../site/src/lib/personal-dashboard'

function snapshot(
  period: string,
  contributors: number,
  sessions: number,
  modelContributors: number,
): NetworkPeriodSnapshot {
  return {
    period,
    overview: {
      period,
      sessions,
      categoryEvents: sessions * 3,
      completionRate: 0.82,
      checkPassRate: 0.76,
      contributors,
    },
    models: [{
      agent: 'codex',
      model: 'gpt-5.2-codex',
      sessions,
      completionRate: 0.84,
      checkPassRate: 0.8,
      contributors: modelContributors,
      inputTokens: sessions * 10_000,
      outputTokens: sessions * 500,
      cachedInputTokens: sessions * 8_000,
      reasoningTokens: sessions * 100,
      tokenizedSessions: sessions,
      reasoningSessions: sessions,
    }],
    toolCategories: [{
      category: 'execute',
      events: sessions * 2,
      sessions,
      completionRate: 0.8,
      checkPassRate: 0.72,
      contributors: modelContributors,
    }],
    mcpServers: [{
      server: 'github',
      calls: sessions * 2,
      sessions,
      successRate: 0.92,
      latencyBucket: 'fast',
      contributors: modelContributors,
    }],
    mcpTools: [{
      server: 'github',
      tool: 'create_issue',
      calls: sessions,
      sessions,
      successRate: 0.88,
      latencyBucket: 'moderate',
      contributors: modelContributors,
    }],
    intents: [{
      intent: 'feature_build',
      sessions,
      completionRate: 0.86,
      checkPassRate: 0.79,
      contributors: modelContributors,
    }],
    workflows: [{
      sequence: ['read', 'write', 'execute'],
      sessions,
      completionRate: 0.88,
      checkPassRate: 0.81,
      contributors: modelContributors,
    }],
  }
}

function liveResponse(): NetworkApiResponse {
  return {
    source: 'network_receipts',
    k_anonymity: 5,
    status: 'live',
    windows: {
      '24h': {
        current: snapshot('rolling:24h:current', 10, 24, 8),
        previous: snapshot('rolling:24h:previous', 10, 20, 6),
      },
      '7d': {
        current: snapshot('rolling:7d:current', 12, 120, 9),
        previous: snapshot('rolling:7d:previous', 12, 100, 8),
      },
      '30d': {
        current: snapshot('rolling:30d:current', 15, 410, 10),
        previous: snapshot('rolling:30d:previous', 14, 350, 9),
      },
    },
  }
}

describe('buildNetworkDashboard', () => {
  it('maps live k-anonymous windows without fixture fallbacks', () => {
    const dashboard = buildNetworkDashboard(liveResponse())

    expect(dashboard.status).toBe('live')
    expect(dashboard.rankings.models.entries).toHaveLength(1)
    expect(dashboard.rankings.models.entries[0]).toMatchObject({
      id: 'codex-gpt-5-2-codex',
      label: 'GPT-5.2 Codex',
      secondary: 'OpenAI',
    })
    expect(dashboard.rankings.models.entries[0].windows['24h']).toMatchObject({
      eligibleContributors: 10,
      contributors: 8,
      adoptionPct: 80,
      volume: 24,
      completionPct: 84,
      trendPct: 20,
      totalTokens: 252_000,
      cachedInputTokens: 192_000,
      reasoningTokens: 2_400,
      tokenizedSessions: 24,
    })
    expect(dashboard.rankings.mcps.entries[0]).toMatchObject({
      id: 'github',
      label: 'GitHub',
      secondary: 'MCP server',
    })
    expect(dashboard.rankings.mcps.entries[0].windows['24h']).toMatchObject({
      volume: 48,
      completionPct: 92,
      latencyBucket: 'fast',
    })
    expect(dashboard.rankings.tools.entries[0]).toMatchObject({
      id: 'shell',
      label: 'Execute',
      secondary: 'Capability',
    })
    expect(dashboard.rankings.tools.entries[0].windows['24h']).toMatchObject({
      volume: 48,
      completionPct: 80,
    })
    expect(dashboard.mcpTools.entries[0]).toMatchObject({
      id: 'github-create-issue',
      iconId: 'github',
      label: 'Create Issue',
      secondary: 'GitHub',
    })
    expect(dashboard.mcpTools.entries[0].windows['24h']).toMatchObject({
      completionPct: 88,
      latencyBucket: 'moderate',
    })
    expect(dashboard.overview?.sessions).toBe(120)
  })

  it('keeps a privacy-threshold response in warm-up with empty rankings', () => {
    const dashboard = buildNetworkDashboard({
      source: 'network_receipts',
      k_anonymity: 5,
      status: 'warming_up',
      windows: {
        '24h': { current: null, previous: null },
        '7d': { current: null, previous: null },
        '30d': { current: null, previous: null },
      },
    })

    expect(dashboard.status).toBe('warming_up')
    expect(dashboard.overview).toBeNull()
    expect(Object.values(dashboard.rankings).every(section => section.entries.length === 0)).toBe(true)
  })
})

describe('fetchNetworkDashboard', () => {
  it('returns unavailable rather than demo data when the API fails', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }))
    const dashboard = await fetchNetworkDashboard(fetcher, 'https://api.example.test')

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/network',
      expect.objectContaining({ next: { revalidate: 300 } }),
    )
    expect(dashboard.status).toBe('unavailable')
    expect(dashboard.overview).toBeNull()
    expect(Object.values(dashboard.rankings).every(section => section.entries.length === 0)).toBe(true)
  })
})

describe('selectDashboard', () => {
  it('defaults to personal activity while keeping the privacy-thresholded network selectable', () => {
    const network = buildNetworkDashboard({
      source: 'network_receipts',
      k_anonymity: 5,
      status: 'warming_up',
      windows: {
        '24h': { current: null, previous: null },
        '7d': { current: null, previous: null },
        '30d': { current: null, previous: null },
      },
    })
    const personal = buildNetworkDashboard({ ...liveResponse(), source: 'local_activity', scope: 'personal', k_anonymity: 1 })

    const dashboard = selectDashboard(undefined, network, personal)
    const networkDashboard = selectDashboard('network', network, personal)

    expect(dashboard.scope).toBe('personal')
    expect(dashboard.availableScopes).toEqual(['personal', 'network'])
    expect(networkDashboard).toMatchObject({
      scope: 'network',
      status: 'warming_up',
      kAnonymity: 5,
      availableScopes: ['personal', 'network'],
      overview: null,
    })
    expect(Object.values(networkDashboard.rankings).every(section => section.entries.length === 0)).toBe(true)
  })

  it('defaults to network data once both scopes are live and honors an explicit personal scope', () => {
    const network = buildNetworkDashboard(liveResponse())
    const personal = buildNetworkDashboard({ ...liveResponse(), source: 'local_activity', scope: 'personal', k_anonymity: 1 })

    expect(selectDashboard(undefined, network, personal)).toMatchObject({
      scope: 'network',
      availableScopes: ['personal', 'network'],
    })
    expect(selectDashboard('personal', network, personal)).toMatchObject({
      scope: 'personal',
      availableScopes: ['personal', 'network'],
    })
  })

  it('keeps an explicitly requested unavailable scope instead of silently changing it', () => {
    const network = buildNetworkDashboard({
      source: 'network_receipts',
      k_anonymity: 5,
      status: 'warming_up',
      windows: {
        '24h': { current: null, previous: null },
        '7d': { current: null, previous: null },
        '30d': { current: null, previous: null },
      },
    })
    const personal = buildNetworkDashboard({ ...liveResponse(), source: 'local_activity', scope: 'personal', k_anonymity: 1 })

    expect(selectDashboard('network', network, personal).scope).toBe('network')
  })
})

describe('personal MCP identities', () => {
  it('keeps locally observed third-party server names instead of collapsing them to private', () => {
    const now = Date.UTC(2026, 7, 14, 12)
    const dashboard = buildPersonalDashboard({
      sessions: [{
        session_id: 'claude-1', source: 'claude-code', model: 'claude-fable-5',
        started_at: now - 1_000, outcome: 'completed', input_tokens: null,
        output_tokens: null, cached_input_tokens: null, reasoning_tokens: null,
      }, {
        session_id: 'claude-unknown', source: 'claude-code', model: null,
        started_at: now - 1_000, outcome: 'completed', input_tokens: null,
        output_tokens: null, cached_input_tokens: null, reasoning_tokens: null,
      }],
      contributions: [],
      tools: [{
        session_id: 'claude-1', timestamp: now - 500,
        tool_name: 'mcp__vibeconferencing__speak', tool_category: 'interact',
        success: 1, mcp_server: 'vibeconferencing', duration_ms: 100,
        sequence_number: 0, attributed_input_tokens: 1_200,
        attributed_output_tokens: 300, attributed_cached_input_tokens: 800,
        attributed_reasoning_tokens: 50,
      }, {
        session_id: 'claude-1', timestamp: now - 400,
        tool_name: 'mcp__8a274664-2873-4d47-88e4-bb6bf1ea64b2__notion-search', tool_category: 'read',
        success: 1, mcp_server: '8a274664-2873-4d47-88e4-bb6bf1ea64b2', duration_ms: 100,
        sequence_number: 1, attributed_input_tokens: 400,
        attributed_output_tokens: 100, attributed_cached_input_tokens: 200,
        attributed_reasoning_tokens: 20,
      }],
    }, now)

    expect(dashboard.rankings.mcps.entries.find(entry => entry.id === 'vibeconferencing')).toMatchObject({
      id: 'vibeconferencing',
      label: 'Vibeconferencing',
      windows: { '24h': { volume: 1_500, calls: 1, cachedInputTokens: 800, reasoningTokens: 50 } },
    })
    expect(dashboard.rankings.mcps.entries.find(entry => entry.id === 'notion')).toMatchObject({
      id: 'notion',
      label: 'Notion',
    })
    expect(dashboard.rankings.mcps.entries.every(entry => entry.id !== 'private')).toBe(true)
    expect(dashboard.rankings.models.entries.map(entry => entry.label)).toEqual(['Claude Fable 5'])
  })
})
