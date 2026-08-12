export type EvidenceGrade = 'reported' | 'observed' | 'inferred-high'

export interface NetworkDemoSnapshot {
  schemaVersion: 2
  provenance: 'synthetic'
  generatedAt: string
  period: {
    start: string
    end: string
    timezone: 'UTC'
    cadence: 'static founding snapshot'
  }
  privacy: {
    aggregation: 'contributor-thresholded rollups'
    minContributorsPerCell: number
    containsRawPrompts: false
    containsUserIdentifiers: false
    compositionAudit: 'passed'
    immutablePublishedSnapshot: true
  }
  panel: {
    label: string
    totalContributors: number
    eligibleContributors: number
    ecosystems: number
    description: string
  }
  summary: {
    contributors: number
    sessions: number
    toolCalls: number
    publishedCells: number
    suppressedCells: number
  }
  models: Array<{
    id: string
    label: string
    provider: string
    contributors: number
    eligibleContributors: number
    sessions: number
    adoptionPct: number
    completionPct: number
  }>
  tools: Array<{
    id: string
    label: string
    category: string
    contributors: number
    eligibleContributors: number
    calls: number
    adoptionPct: number
  }>
  intents: Array<{
    id: string
    label: string
    sessions: number
    contributors: number
    sharePct: number
    toolMix: Array<{
      category: 'Read' | 'Execute' | 'Write' | 'Interact'
      sharePct: number
    }>
  }>
  workflows: Array<{
    id: string
    label: string
    sequence: string[]
    sessions: number
    contributors: number
    completionPct: number
    checkPassPct: number | null
    evidence: EvidenceGrade
  }>
  egressManifest: Array<{
    field: string
    example: string
    evidence: EvidenceGrade
  }>
  excludedFields: string[]
}

const FORBIDDEN_NETWORK_KEYS = new Set([
  'prompt_text',
  'response_summary',
  'session_id',
  'contributor_id',
  'subject',
  'transcript_path',
  'cwd',
  'tool_arguments',
  'file_path',
  'command_text',
])

function objectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(objectKeys)
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => [key, ...objectKeys(child)])
}

function assertContributorThreshold(
  label: string,
  cells: Array<{ contributors: number }>,
  k: number,
): void {
  if (cells.some(cell => cell.contributors < k)) {
    throw new Error(`${label} contains a cell below the contributor threshold of ${k}`)
  }
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.11
}

/** Fails closed if the illustrative fixture stops matching the v0 receipt boundary. */
export function assertNetworkDemoSnapshot(snapshot: NetworkDemoSnapshot): void {
  const k = snapshot.privacy.minContributorsPerCell
  if (k < 5) throw new Error('Network demo must use contributor anonymity of at least 5')
  if (snapshot.privacy.containsRawPrompts || snapshot.privacy.containsUserIdentifiers) {
    throw new Error('Network demo must contain aggregate-only data')
  }
  if (snapshot.privacy.compositionAudit !== 'passed') {
    throw new Error('Network demo must pass its whole-snapshot composition audit')
  }

  const leakingKey = objectKeys(snapshot).find(key => FORBIDDEN_NETWORK_KEYS.has(key))
  if (leakingKey) throw new Error(`Network demo contains forbidden field: ${leakingKey}`)

  if (
    snapshot.panel.totalContributors !== snapshot.summary.contributors
    || snapshot.panel.eligibleContributors > snapshot.panel.totalContributors
  ) {
    throw new Error('Panel and summary contributor totals must agree')
  }

  assertContributorThreshold('Models', snapshot.models, k)
  assertContributorThreshold('Tools', snapshot.tools, k)
  assertContributorThreshold('Intents', snapshot.intents, k)
  assertContributorThreshold('Workflows', snapshot.workflows, k)

  for (const model of snapshot.models) {
    const expectedAdoption = (model.contributors / model.eligibleContributors) * 100
    if (!nearlyEqual(model.adoptionPct, expectedAdoption)) {
      throw new Error(`Model adoption denominator is inconsistent for ${model.id}`)
    }
  }
  for (const tool of snapshot.tools) {
    const expectedAdoption = (tool.contributors / tool.eligibleContributors) * 100
    if (!nearlyEqual(tool.adoptionPct, expectedAdoption)) {
      throw new Error(`Tool adoption denominator is inconsistent for ${tool.id}`)
    }
  }
  for (const intent of snapshot.intents) {
    const mixTotal = intent.toolMix.reduce((sum, item) => sum + item.sharePct, 0)
    if (mixTotal !== 100) throw new Error(`Tool mix must total 100 for ${intent.id}`)
  }

  const modelSessions = snapshot.models.reduce((sum, model) => sum + model.sessions, 0)
  const intentSessions = snapshot.intents.reduce((sum, intent) => sum + intent.sessions, 0)
  const toolCalls = snapshot.tools.reduce((sum, tool) => sum + tool.calls, 0)
  if (
    modelSessions !== snapshot.summary.sessions
    || intentSessions !== snapshot.summary.sessions
    || toolCalls !== snapshot.summary.toolCalls
  ) {
    throw new Error('Network demo summary must be derived from its publishable cells')
  }
}
