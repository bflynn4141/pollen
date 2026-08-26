import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectDashboard, type NetworkDashboard } from '@/lib/network-dashboard'

const { fetchDashboardMock, fetchContributorEarningsMock } = vi.hoisted(() => ({
  fetchDashboardMock: vi.fn(),
  fetchContributorEarningsMock: vi.fn(),
}))

vi.mock('@/lib/network-dashboard', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/network-dashboard')>(),
  fetchDashboard: fetchDashboardMock,
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
}))

vi.mock('@/lib/contributor-earnings', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/contributor-earnings')>(),
  fetchContributorEarnings: fetchContributorEarningsMock,
}))

import DashboardPage from './page'
import RankingPage from './[section]/page'

const emptyDefinition = (label: string) => ({
  label,
  singular: label,
  description: '',
  volumeLabel: 'Runs',
  adoptionLabel: 'Adoption',
  entries: [],
})

const personalDashboard: NetworkDashboard = {
  status: 'warming_up',
  scope: 'personal',
  availableScopes: ['personal', 'network'],
  kAnonymity: 1,
  overview: null,
  rankings: {
    models: emptyDefinition('Model rankings'),
    mcps: emptyDefinition('MCP rankings'),
    tools: emptyDefinition('Tool rankings'),
    workflows: emptyDefinition('Workflow rankings'),
    intents: emptyDefinition('Intent rankings'),
  },
  mcpTools: emptyDefinition('MCP tool calls'),
}

describe('dashboard scope routing', () => {
  beforeEach(() => {
    fetchDashboardMock.mockReset()
    fetchDashboardMock.mockResolvedValue(personalDashboard)
    fetchContributorEarningsMock.mockReset()
    fetchContributorEarningsMock.mockResolvedValue({
      status: 'ready',
      walletAddress: '0x1111111111111111111111111111111111111111',
      pollenBalance: '12.5',
      pendingUsdc: '2.75',
      claimStatus: 'claimable',
      activeRevenue: {
        cutoverStatus: 'planned',
        dataStatus: 'ready',
        totalClaimableUsdc: '0',
        claimCount: 0,
      },
      tokenAddress: '0x8ED2E55875Bf4C3082364441FfD314Ec6E228318',
    })
  })

  it('selects personal data and keeps the scope on overview links', async () => {
    const renderPage = DashboardPage as unknown as (props: {
      searchParams: Promise<{ scope?: string }>
    }) => Promise<React.ReactNode>
    const page = await renderPage({ searchParams: Promise.resolve({ scope: 'personal' }) })
    const html = renderToStaticMarkup(page)

    expect(fetchDashboardMock).toHaveBeenCalledWith('personal')
    expect(html).toContain('aria-label="Dashboard scope"')
    expect(html).toContain('/dashboard/models?scope=personal')
    expect(html).toContain('Contributor earnings')
    expect(html).toContain('2.75')
    expect(html).toContain('Ready to claim')
    expect(html).toContain('Legacy V2 pending USDC')
    expect(html).toContain('Active-holder claims')
    expect(html).toContain('Planned, not live')
  })

  it('keeps scope, window, and MCP view on ranking navigation', async () => {
    const page = await RankingPage({
      params: Promise.resolve({ section: 'mcps' }),
      searchParams: Promise.resolve({ scope: 'personal', window: '30d', view: 'tools' }),
    })
    const html = renderToStaticMarkup(page)

    expect(fetchDashboardMock).toHaveBeenCalledWith('personal')
    expect(html).toContain('/dashboard/mcps?scope=personal&amp;window=7d&amp;view=tools')
    expect(html).toContain('/dashboard/tools?scope=personal')
    expect(html).toContain('/dashboard/mcps?scope=network&amp;window=30d&amp;view=tools')
  })

  it('keeps the privacy-thresholded network state selectable beside local activity', () => {
    const network: NetworkDashboard = {
      ...personalDashboard,
      status: 'warming_up',
      scope: 'network',
      availableScopes: [],
      kAnonymity: 5,
    }
    const personal: NetworkDashboard = {
      ...personalDashboard,
      status: 'live',
    }

    const selected = selectDashboard('network', network, personal)

    expect(selected.scope).toBe('network')
    expect(selected.status).toBe('warming_up')
    expect(selected.kAnonymity).toBe(5)
    expect(selected.availableScopes).toEqual(['personal', 'network'])
  })
})
