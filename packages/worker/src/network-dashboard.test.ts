import { describe, expect, it, vi } from 'vitest'
import {
  buildNetworkDashboard,
  fetchNetworkDashboard,
  type NetworkApiResponse,
  type NetworkPeriodSnapshot,
} from '../../site/src/lib/network-dashboard'

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
    }],
    toolCategories: [{
      category: 'execute',
      events: sessions * 2,
      sessions,
      completionRate: 0.8,
      checkPassRate: 0.72,
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
    })
    expect(dashboard.rankings.tools.entries[0].windows['24h']?.completionPct).toBe(80)
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
