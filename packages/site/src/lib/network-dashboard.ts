export const RANKING_WINDOWS = [
  { id: '24h', label: '24H' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
] as const

export type RankingWindow = typeof RANKING_WINDOWS[number]['id']
export type RankingSection = 'models' | 'tools' | 'workflows' | 'intents'
export type NetworkStatus = 'live' | 'warming_up' | 'unavailable'

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
}

export interface NetworkPeriodSnapshot {
  period: string
  overview: ReceiptOverview
  models: Array<OutcomeRank & { agent: string; model: string }>
  toolCategories: Array<OutcomeRank & { category: string; events: number }>
  intents: Array<OutcomeRank & { intent: string }>
  workflows: Array<OutcomeRank & { sequence: string[] }>
}

export interface NetworkApiResponse {
  source: 'network_receipts'
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
}

export interface RankingEntry {
  id: string
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
  kAnonymity: number
  overview: ReceiptOverview | null
  rankings: Record<RankingSection, RankingDefinition>
}

export const RANKING_SECTION_META: Record<RankingSection, Omit<RankingDefinition, 'entries'>> = {
  models: {
    label: 'Model rankings',
    singular: 'Model',
    description: 'Model adoption and observed completion across the contributor network.',
    volumeLabel: 'Model runs',
    adoptionLabel: 'Adoption',
  },
  tools: {
    label: 'Tool rankings',
    singular: 'Tool category',
    description: 'Coarsened tool categories used across contributor sessions.',
    volumeLabel: 'Tool events',
    adoptionLabel: 'Adoption',
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
): RankingMetric {
  const currentAdoption = adoption(current.contributors, currentEligible)
  const previousAdoption = previous ? adoption(previous.contributors, previousEligible) : null
  return {
    eligibleContributors: currentEligible,
    contributors: current.contributors,
    adoptionPct: currentAdoption,
    volume,
    completionPct: round1(current.completionRate * 100),
    trendPct: previousAdoption == null ? null : round1(currentAdoption - previousAdoption),
  }
}

type RawEntry = OutcomeRank & {
  key: string
  id: string
  label: string
  secondary: string
  volume: number
  sequence?: string[]
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
  if (section === 'tools') return snapshot.toolCategories.map(item => ({
    ...item,
    key: item.category,
    id: categoryIconId[item.category] ?? slug(item.category),
    label: title(item.category),
    secondary: 'Capability',
    volume: item.events,
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

function buildSection(section: RankingSection, response: NetworkApiResponse): RankingDefinition {
  const entries = new Map<string, RankingEntry>()
  for (const window of RANKING_WINDOWS) {
    const pair = response.windows[window.id]
    if (!pair.current) continue
    const previous = pair.previous
      ? new Map(rawEntries(section, pair.previous).map(item => [item.key, item]))
      : new Map<string, RawEntry>()
    for (const item of rawEntries(section, pair.current)) {
      const entry = entries.get(item.key) ?? {
        id: item.id,
        label: item.label,
        secondary: item.secondary,
        ...(item.sequence ? { sequence: item.sequence } : {}),
        windows: emptyWindows(),
      }
      entry.windows[window.id] = metric(
        item,
        previous.get(item.key),
        pair.current.overview.contributors,
        pair.previous?.overview.contributors ?? 0,
        item.volume,
      )
      entries.set(item.key, entry)
    }
  }
  return { ...RANKING_SECTION_META[section], entries: [...entries.values()] }
}

function emptyDashboard(status: NetworkStatus, kAnonymity = 5): NetworkDashboard {
  return {
    status,
    kAnonymity,
    overview: null,
    rankings: {
      models: { ...RANKING_SECTION_META.models, entries: [] },
      tools: { ...RANKING_SECTION_META.tools, entries: [] },
      workflows: { ...RANKING_SECTION_META.workflows, entries: [] },
      intents: { ...RANKING_SECTION_META.intents, entries: [] },
    },
  }
}

export function buildNetworkDashboard(response: NetworkApiResponse): NetworkDashboard {
  if (response.status !== 'live') return emptyDashboard('warming_up', response.k_anonymity)
  return {
    status: 'live',
    kAnonymity: response.k_anonymity,
    overview: response.windows['7d'].current?.overview ?? null,
    rankings: {
      models: buildSection('models', response),
      tools: buildSection('tools', response),
      workflows: buildSection('workflows', response),
      intents: buildSection('intents', response),
    },
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
