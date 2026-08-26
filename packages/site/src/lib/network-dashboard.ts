export const RANKING_WINDOWS = [
  { id: '24h', label: '24H' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
] as const

export type RankingWindow = typeof RANKING_WINDOWS[number]['id']
export type RankingSection = 'models' | 'mcps' | 'tools' | 'workflows' | 'intents'
export type NetworkStatus = 'live' | 'warming_up' | 'unavailable'
export type DashboardScope = 'network' | 'personal'

export interface ReceiptOverview {
  period: string
  sessions: number
  categoryEvents: number
  completionRate: number
  checkPassRate: number
  contributors: number
}

interface OutcomeRank {
  sessions: number
  completionRate: number
  checkPassRate: number
  contributors: number
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  tokenizedSessions?: number
  reasoningSessions?: number
  tokenizedEvents?: number
  calls?: number
}

interface McpOutcomeRank {
  calls: number
  sessions: number
  successRate: number
  latencyBucket: string
  contributors: number
  inputTokens?: number
  outputTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  tokenizedSessions?: number
  tokenizedEvents?: number
}

export interface NetworkPeriodSnapshot {
  period: string
  overview: ReceiptOverview
  models: Array<OutcomeRank & { agent: string; model: string }>
  toolCategories: Array<OutcomeRank & { category: string; events: number }>
  mcpServers: Array<McpOutcomeRank & { server: string }>
  mcpTools: Array<McpOutcomeRank & { server: string; tool: string }>
  intents: Array<OutcomeRank & { intent: string }>
  workflows: Array<OutcomeRank & { sequence: string[] }>
}

export interface NetworkApiResponse {
  source: 'network_receipts' | 'local_activity'
  scope?: DashboardScope
  k_anonymity: number
  status: 'live' | 'warming_up'
  windows: Record<RankingWindow, {
    current: NetworkPeriodSnapshot | null
    previous: NetworkPeriodSnapshot | null
  }>
}

export interface RankingMetric {
  eligibleContributors: number
  contributors: number
  adoptionPct: number
  volume: number
  completionPct: number
  trendPct: number | null
  latencyBucket?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  cachedInputTokens?: number
  reasoningTokens?: number
  tokenizedSessions?: number
  reasoningSessions?: number
  calls?: number
  tokenizedEvents?: number
}

export interface RankingEntry {
  id: string
  iconId?: string
  label: string
  secondary: string
  sequence?: string[]
  windows: Record<RankingWindow, RankingMetric | null>
}

export interface RankingDefinition {
  label: string
  singular: string
  description: string
  volumeLabel: string
  adoptionLabel: string
  entries: RankingEntry[]
}

export interface NetworkDashboard {
  status: NetworkStatus
  scope: DashboardScope
  availableScopes: DashboardScope[]
  kAnonymity: number
  overview: ReceiptOverview | null
  rankings: Record<RankingSection, RankingDefinition>
  mcpTools: RankingDefinition
}

export const RANKING_SECTION_META: Record<RankingSection, Omit<RankingDefinition, 'entries'>> = {
  models: {
    label: 'Model rankings',
    singular: 'Model',
    description: 'Model adoption and observed completion across the contributor network.',
    volumeLabel: 'Model runs',
    adoptionLabel: 'Adoption',
  },
  mcps: {
    label: 'MCP rankings',
    singular: 'MCP server',
    description: 'Third-party MCP server adoption, reliability, and observed latency.',
    volumeLabel: 'Attributed tokens',
    adoptionLabel: 'Compute share',
  },
  tools: {
    label: 'Tool rankings',
    singular: 'Tool category',
    description: 'Coarsened tool categories used across contributor sessions.',
    volumeLabel: 'Attributed tokens',
    adoptionLabel: 'Compute share',
  },
  workflows: {
    label: 'Workflow rankings',
    singular: 'Workflow',
    description: 'Observed tool-category sequences across contributor sessions.',
    volumeLabel: 'Workflow runs',
    adoptionLabel: 'Adoption',
  },
  intents: {
    label: 'Intent rankings',
    singular: 'Intent',
    description: 'Jobs delegated to agents and their observed completion.',
    volumeLabel: 'Classified sessions',
    adoptionLabel: 'Panel reach',
  },
}

const MCP_TOOL_META: Omit<RankingDefinition, 'entries'> = {
  label: 'MCP tool calls',
  singular: 'MCP tool',
  description: 'Individual third-party tools called through MCP servers.',
  volumeLabel: 'Attributed tokens',
  adoptionLabel: 'Compute share',
}

const emptyWindows = (): Record<RankingWindow, RankingMetric | null> => ({
  '24h': null,
  '7d': null,
  '30d': null,
})

const round1 = (value: number) => Math.round(value * 10) / 10
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const title = (value: string) => value
  .replaceAll('_', ' ')
  .replaceAll('-', ' ')
  .replace(/\b\w/g, character => character.toUpperCase())
  .replace(/^Gpt\b/, 'GPT')

const mcpLabel = (value: string) => ({
  github: 'GitHub',
  gmail: 'Gmail',
  posthog: 'PostHog',
  playwright: 'Playwright',
  sentry: 'Sentry',
  supabase: 'Supabase',
  vercel: 'Vercel',
}[value] ?? title(value))

function modelLabel(model: string): string {
  return title(model)
    .replace(/\b(\d) (\d)\b/g, '$1.$2')
    .replace(/^GPT /, 'GPT-')
}

function providerFor(agent: string): string {
  if (/claude|anthropic/i.test(agent)) return 'Anthropic'
  if (/codex|openai/i.test(agent)) return 'OpenAI'
  return title(agent)
}

const categoryIconId: Record<string, string> = {
  execute: 'shell',
  read: 'read-search',
  write: 'edit-write',
  interact: 'web-browser',
  reason: 'task-planner',
}

function adoption(contributors: number, eligible: number): number {
  return eligible > 0 ? round1((contributors / eligible) * 100) : 0
}

function metric(
  current: OutcomeRank,
  previous: OutcomeRank | undefined,
  currentEligible: number,
  previousEligible: number,
  volume: number,
  latencyBucket?: string,
  personalShare?: {
    currentTotal: number
    previousVolume: number | null
    previousTotal: number
  },
  isPersonal = false,
): RankingMetric {
  const currentAdoption = personalShare
    ? adoption(volume, personalShare.currentTotal)
    : adoption(current.contributors, currentEligible)
  const previousAdoption = previous
    ? personalShare
      ? adoption(personalShare.previousVolume ?? 0, personalShare.previousTotal)
      : adoption(previous.contributors, previousEligible)
    : null
  return {
    eligibleContributors: isPersonal ? 1 : currentEligible,
    contributors: isPersonal ? 1 : current.contributors,
    adoptionPct: currentAdoption,
    volume,
    completionPct: round1(current.completionRate * 100),
    trendPct: previousAdoption == null ? null : round1(currentAdoption - previousAdoption),
    ...(current.inputTokens != null || current.outputTokens != null ? {
      inputTokens: current.inputTokens ?? 0,
      outputTokens: current.outputTokens ?? 0,
      totalTokens: (current.inputTokens ?? 0) + (current.outputTokens ?? 0),
      cachedInputTokens: current.cachedInputTokens ?? 0,
      ...(current.reasoningTokens != null ? { reasoningTokens: current.reasoningTokens } : {}),
      tokenizedSessions: current.tokenizedSessions ?? 0,
      tokenizedEvents: current.tokenizedEvents ?? 0,
      reasoningSessions: current.reasoningSessions ?? 0,
    } : {}),
    ...(current.calls != null ? { calls: current.calls } : {}),
    ...(latencyBucket ? { latencyBucket } : {}),
  }
}

type RawEntry = OutcomeRank & {
  key: string
  id: string
  label: string
  secondary: string
  volume: number
  sequence?: string[]
  latencyBucket?: string
  iconId?: string
}

function rawEntries(section: RankingSection, snapshot: NetworkPeriodSnapshot): RawEntry[] {
  if (section === 'models') return snapshot.models.map(item => ({
    ...item,
    key: `${item.agent}\0${item.model}`,
    id: slug(`${item.agent}-${item.model}`),
    label: modelLabel(item.model),
    secondary: providerFor(item.agent),
    volume: item.sessions,
  }))
  if (section === 'mcps') return (snapshot.mcpServers ?? []).map(item => ({
    ...item,
    completionRate: item.successRate,
    checkPassRate: item.successRate,
    key: item.server,
    id: item.server,
    label: mcpLabel(item.server),
    secondary: 'MCP server',
    volume: item.inputTokens != null || item.outputTokens != null
      ? (item.inputTokens ?? 0) + (item.outputTokens ?? 0)
      : item.calls,
    latencyBucket: item.latencyBucket,
  }))
  if (section === 'tools') return snapshot.toolCategories.map(item => ({
    ...item,
    calls: item.events,
    key: item.category,
    id: categoryIconId[item.category] ?? slug(item.category),
    label: title(item.category),
    secondary: 'Capability',
    volume: item.inputTokens != null || item.outputTokens != null
      ? (item.inputTokens ?? 0) + (item.outputTokens ?? 0)
      : item.events,
  }))
  if (section === 'intents') return snapshot.intents.map(item => ({
    ...item,
    key: item.intent,
    id: slug(item.intent),
    label: title(item.intent),
    secondary: 'Observed',
    volume: item.sessions,
  }))
  return snapshot.workflows.map(item => ({
    ...item,
    key: item.sequence.join('>'),
    id: slug(item.sequence.join('-')),
    label: item.sequence.map(title).join(' → '),
    secondary: 'Observed',
    sequence: item.sequence.map(title),
    volume: item.sessions,
  }))
}

function rawMcpToolEntries(snapshot: NetworkPeriodSnapshot): RawEntry[] {
  return (snapshot.mcpTools ?? []).map(item => ({
    ...item,
    completionRate: item.successRate,
    checkPassRate: item.successRate,
    key: `${item.server}\0${item.tool}`,
    id: slug(`${item.server}-${item.tool}`),
    iconId: item.server,
    label: title(item.tool),
    secondary: mcpLabel(item.server),
    volume: item.inputTokens != null || item.outputTokens != null
      ? (item.inputTokens ?? 0) + (item.outputTokens ?? 0)
      : item.calls,
    latencyBucket: item.latencyBucket,
  }))
}

function buildRanking(
  metadata: Omit<RankingDefinition, 'entries'>,
  response: NetworkApiResponse,
  entriesForSnapshot: (snapshot: NetworkPeriodSnapshot) => RawEntry[],
  useVolumeShare = false,
): RankingDefinition {
  const entries = new Map<string, RankingEntry>()
  for (const window of RANKING_WINDOWS) {
    const pair = response.windows[window.id]
    if (!pair.current) continue
    const currentItems = entriesForSnapshot(pair.current)
    const previousItems = pair.previous ? entriesForSnapshot(pair.previous) : []
    const previous = pair.previous
      ? new Map(previousItems.map(item => [item.key, item]))
      : new Map<string, RawEntry>()
    const currentTotal = currentItems.reduce((sum, item) => sum + item.volume, 0)
    const previousTotal = previousItems.reduce((sum, item) => sum + item.volume, 0)
    for (const item of currentItems) {
      const previousItem = previous.get(item.key)
      const entry = entries.get(item.key) ?? {
        id: item.id,
        label: item.label,
        secondary: item.secondary,
        ...(item.iconId ? { iconId: item.iconId } : {}),
        ...(item.sequence ? { sequence: item.sequence } : {}),
        windows: emptyWindows(),
      }
      entry.windows[window.id] = metric(
        item,
        previousItem,
        pair.current.overview.contributors,
        pair.previous?.overview.contributors ?? 0,
        item.volume,
        item.latencyBucket,
        response.scope === 'personal' || useVolumeShare ? {
          currentTotal,
          previousVolume: previousItem?.volume ?? null,
          previousTotal,
        } : undefined,
        response.scope === 'personal',
      )
      entries.set(item.key, entry)
    }
  }
  return { ...metadata, entries: [...entries.values()] }
}

function buildSection(section: RankingSection, response: NetworkApiResponse): RankingDefinition {
  return buildRanking(
    RANKING_SECTION_META[section],
    response,
    snapshot => rawEntries(section, snapshot),
    section === 'mcps' || section === 'tools',
  )
}

function emptyDashboard(status: NetworkStatus, kAnonymity = 5, scope: DashboardScope = 'network'): NetworkDashboard {
  return {
    status,
    scope,
    availableScopes: [],
    kAnonymity,
    overview: null,
    rankings: {
      models: { ...RANKING_SECTION_META.models, entries: [] },
      mcps: { ...RANKING_SECTION_META.mcps, entries: [] },
      tools: { ...RANKING_SECTION_META.tools, entries: [] },
      workflows: { ...RANKING_SECTION_META.workflows, entries: [] },
      intents: { ...RANKING_SECTION_META.intents, entries: [] },
    },
    mcpTools: { ...MCP_TOOL_META, entries: [] },
  }
}

export function buildNetworkDashboard(response: NetworkApiResponse): NetworkDashboard {
  const scope = response.scope ?? 'network'
  if (response.status !== 'live') return emptyDashboard('warming_up', response.k_anonymity, scope)
  return {
    status: 'live',
    scope,
    availableScopes: [scope],
    kAnonymity: response.k_anonymity,
    overview: response.windows['7d'].current?.overview ?? null,
    rankings: {
      models: buildSection('models', response),
      mcps: buildSection('mcps', response),
      tools: buildSection('tools', response),
      workflows: buildSection('workflows', response),
      intents: buildSection('intents', response),
    },
    mcpTools: buildRanking(MCP_TOOL_META, response, rawMcpToolEntries, true),
  }
}

function isNetworkApiResponse(value: unknown): value is NetworkApiResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<NetworkApiResponse>
  return candidate.source === 'network_receipts'
    && (candidate.status === 'live' || candidate.status === 'warming_up')
    && typeof candidate.k_anonymity === 'number'
    && !!candidate.windows
    && RANKING_WINDOWS.every(window => window.id in candidate.windows!)
}

type NetworkFetch = (input: string, init?: RequestInit & { next?: { revalidate: number } }) => Promise<Response>

export async function fetchNetworkDashboard(
  fetcher: NetworkFetch = fetch,
  apiBase = process.env.POLLEN_API_URL ?? 'https://pollen-api.bflynn4141.workers.dev',
): Promise<NetworkDashboard> {
  try {
    const response = await fetcher(`${apiBase.replace(/\/$/, '')}/api/v1/network`, {
      next: { revalidate: 300 },
    })
    if (!response.ok) return emptyDashboard('unavailable')
    const payload: unknown = await response.json()
    return isNetworkApiResponse(payload) ? buildNetworkDashboard(payload) : emptyDashboard('unavailable')
  } catch {
    return emptyDashboard('unavailable')
  }
}

export function isDashboardScope(value: string | string[] | undefined): value is DashboardScope {
  return value === 'network' || value === 'personal'
}

export function selectDashboard(
  requestedScope: DashboardScope | undefined,
  network: NetworkDashboard,
  personal?: NetworkDashboard,
): NetworkDashboard {
  const availableScopes: DashboardScope[] = [
    ...(personal ? ['personal' as const] : []),
    'network',
  ]
  const selected = requestedScope === 'personal' && personal
    ? personal
    : requestedScope === 'network'
      ? network
      : network.status === 'live'
        ? network
        : personal?.status === 'live'
          ? personal
          : network

  return { ...selected, availableScopes }
}

function canReadPersonalActivity(): boolean {
  if (process.env.VERCEL === '1') return false
  return process.env.NODE_ENV === 'development' || process.env.POLLEN_LOCAL_DATA === '1'
}

export async function fetchDashboard(requestedScope?: DashboardScope): Promise<NetworkDashboard> {
  const networkPromise = fetchNetworkDashboard()
  const personalPromise = canReadPersonalActivity()
    ? import('./personal-dashboard').then(({ fetchPersonalDashboard }) => fetchPersonalDashboard())
    : Promise.resolve(undefined)
  const [network, personal] = await Promise.all([networkPromise, personalPromise])
  return selectDashboard(requestedScope, network, personal)
}
