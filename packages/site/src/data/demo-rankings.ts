export type RankingWindow = '24h' | '7d' | '30d'
export type RankingSection = 'models' | 'tools' | 'workflows' | 'intents'

export interface RankingMetric {
  eligibleContributors: number
  contributors: number
  adoptionPct: number
  volume: number
  completionPct: number
  trendPct: number
}

export interface RankingEntry {
  id: string
  label: string
  secondary: string
  sequence?: string[]
  windows: Record<RankingWindow, RankingMetric>
}

export interface RankingDefinition {
  label: string
  singular: string
  description: string
  volumeLabel: string
  adoptionLabel: string
  entries: RankingEntry[]
}

export const RANKING_WINDOWS: Array<{ id: RankingWindow; label: string; eligible: number }> = [
  { id: '24h', label: '24H', eligible: 15 },
  { id: '7d', label: '7D', eligible: 18 },
  { id: '30d', label: '30D', eligible: 24 },
]

const round1 = (value: number) => Math.round(value * 10) / 10
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function metric(eligible: number, targetAdoption: number, volume: number, completionPct: number, trendPct: number): RankingMetric {
  const contributors = clamp(Math.round((targetAdoption / 100) * eligible), 5, eligible)
  return {
    eligibleContributors: eligible,
    contributors,
    adoptionPct: round1((contributors / eligible) * 100),
    volume: Math.max(1, Math.round(volume)),
    completionPct: round1(completionPct),
    trendPct: round1(trendPct),
  }
}

function windows(
  weeklyVolume: number,
  weeklyAdoption: number,
  completion: number,
  shortShift: number,
  longShift: number,
  trends: [number, number, number],
): Record<RankingWindow, RankingMetric> {
  return {
    '24h': metric(15, weeklyAdoption + shortShift, weeklyVolume / 6.4, completion + shortShift * .18, trends[0]),
    '7d': metric(18, weeklyAdoption, weeklyVolume, completion, trends[1]),
    '30d': metric(24, weeklyAdoption + longShift, weeklyVolume * 4.15, completion + longShift * .12, trends[2]),
  }
}

export const DEMO_RANKINGS: Record<RankingSection, RankingDefinition> = {
  models: {
    label: 'Model rankings',
    singular: 'model',
    description: 'Which models agents choose, how often they return, and whether observed sessions reach completion.',
    volumeLabel: 'Model runs',
    adoptionLabel: 'Adoption',
    entries: [
      { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', secondary: 'Anthropic', windows: windows(112, 77.8, 82, -4, 3, [-2.1, 4.8, 8.3]) },
      { id: 'gpt-5-2-codex', label: 'GPT-5.2 Codex', secondary: 'OpenAI', windows: windows(95, 66.7, 79, 8, -2, [9.2, 3.5, 6.4]) },
      { id: 'claude-opus-4-1', label: 'Claude Opus 4.1', secondary: 'Anthropic', windows: windows(68, 50, 86, 3, 4, [4.1, 2.4, 7.1]) },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', secondary: 'Anthropic', windows: windows(57, 44.4, 78, 5, -3, [7.8, 5.1, -1.2]) },
      { id: 'gpt-5-2', label: 'GPT-5.2', secondary: 'OpenAI', windows: windows(51, 38.9, 75, -1, 6, [-1.4, 1.9, 9.6]) },
      { id: 'gpt-5-2-mini', label: 'GPT-5.2 mini', secondary: 'OpenAI', windows: windows(45, 38.9, 73, 7, -4, [11.5, 6.2, -3.1]) },
      { id: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet', secondary: 'Anthropic', windows: windows(34, 33.3, 76, -5, 8, [-8.4, -3.2, 4.4]) },
      { id: 'gpt-4-1-codex', label: 'GPT-4.1 Codex', secondary: 'OpenAI', windows: windows(29, 27.8, 69, 4, 7, [3.2, -1.1, -7.8]) },
    ],
  },
  tools: {
    label: 'Tool rankings',
    singular: 'tool',
    description: 'The capabilities agents reach for across execution, reading, writing, browsing, and external systems.',
    volumeLabel: 'Tool calls',
    adoptionLabel: 'Adoption',
    entries: [
      { id: 'shell', label: 'Shell execution', secondary: 'Execute', windows: windows(1110, 94.4, 91, 2, 1, [2.8, 3.4, 5.1]) },
      { id: 'read-search', label: 'Read + search', secondary: 'Read', windows: windows(774, 88.9, 96, -2, 3, [-1.6, 2.1, 4.9]) },
      { id: 'edit-write', label: 'Edit + write', secondary: 'Write', windows: windows(378, 83.3, 89, 4, 2, [5.8, 4.2, 7.2]) },
      { id: 'web-browser', label: 'Web browser', secondary: 'Interact', windows: windows(214, 66.7, 84, 8, -3, [12.4, 7.8, 2.1]) },
      { id: 'github-mcp', label: 'GitHub MCP', secondary: 'Interact', windows: windows(126, 55.6, 87, 3, 5, [4.9, 5.6, 11.2]) },
      { id: 'file-system', label: 'File system', secondary: 'Read', windows: windows(103, 50, 94, -3, 7, [-4.5, 1.2, 8.7]) },
      { id: 'playwright', label: 'Playwright', secondary: 'Interact', windows: windows(70, 38.9, 81, 9, 1, [15.1, 8.3, 10.5]) },
      { id: 'database', label: 'Database query', secondary: 'Interact', windows: windows(61, 38.9, 79, 4, -1, [6.8, 3.9, 1.6]) },
      { id: 'task-planner', label: 'Task planner', secondary: 'Reason', windows: windows(48, 33.3, 88, 5, 5, [8.2, 5.4, 12.1]) },
      { id: 'docs-search', label: 'Docs search', secondary: 'Read', windows: windows(39, 27.8, 93, 7, 8, [10.6, 6.1, 15.8]) },
    ],
  },
  workflows: {
    label: 'Workflow rankings',
    singular: 'workflow',
    description: 'Repeatable agent sequences ranked by contributor adoption, volume, completion, and observed checks.',
    volumeLabel: 'Workflow runs',
    adoptionLabel: 'Adoption',
    entries: [
      { id: 'inspect-edit-test', label: 'Implementation loop', secondary: 'observed', sequence: ['inspect', 'edit', 'test'], windows: windows(84, 88.9, 86, 1, 2, [1.9, 4.3, 7.7]) },
      { id: 'search-read-edit', label: 'Codebase navigation', secondary: 'observed', sequence: ['search', 'read', 'edit'], windows: windows(62, 77.8, 82, -2, 4, [-3.1, 2.8, 9.1]) },
      { id: 'plan-code-pr', label: 'Issue to pull request', secondary: 'observed', sequence: ['plan', 'code', 'test', 'PR'], windows: windows(48, 61.1, 88, 7, 5, [10.8, 6.7, 14.3]) },
      { id: 'error-search-fix', label: 'Debugging loop', secondary: 'observed', sequence: ['error', 'search', 'fix', 'test'], windows: windows(42, 66.7, 76, 4, -2, [6.2, 3.4, -1.8]) },
      { id: 'research-plan-build', label: 'Research to build', secondary: 'inferred-high', sequence: ['research', 'plan', 'implement'], windows: windows(31, 44.4, 71, 8, 6, [13.1, 8.9, 16.2]) },
      { id: 'review-comment-fix', label: 'Review resolution', secondary: 'observed', sequence: ['review', 'comment', 'fix'], windows: windows(27, 38.9, 84, 5, 1, [7.4, 4.8, 8.1]) },
      { id: 'spec-plan-implement', label: 'Spec to implementation', secondary: 'inferred-high', sequence: ['spec', 'plan', 'implement', 'verify'], windows: windows(23, 33.3, 81, 9, 7, [16.5, 10.2, 19.4]) },
      { id: 'reproduce-test-fix', label: 'Test-first repair', secondary: 'observed', sequence: ['reproduce', 'test', 'fix'], windows: windows(19, 27.8, 90, 12, 8, [21.3, 12.7, 23.8]) },
    ],
  },
  intents: {
    label: 'Intent rankings',
    singular: 'intent',
    description: 'What people delegate to agents, showing which jobs are growing and how reliably they complete.',
    volumeLabel: 'Classified sessions',
    adoptionLabel: 'Panel reach',
    entries: [
      { id: 'feature-build', label: 'Feature build', secondary: 'Build', windows: windows(132, 88.9, 84, 2, 2, [3.4, 5.2, 8.6]) },
      { id: 'debugging', label: 'Debugging', secondary: 'Repair', windows: windows(78, 77.8, 78, 5, 4, [8.1, 6.4, 11.3]) },
      { id: 'code-review', label: 'Code review', secondary: 'Review', windows: windows(46, 66.7, 91, -4, 6, [-6.2, 1.8, 9.4]) },
      { id: 'testing', label: 'Testing', secondary: 'Verify', windows: windows(41, 61.1, 87, 7, 2, [11.7, 8.1, 10.2]) },
      { id: 'exploration', label: 'Exploration', secondary: 'Research', windows: windows(29, 44.4, 68, 8, -2, [14.2, 7.6, 3.1]) },
      { id: 'documentation', label: 'Documentation', secondary: 'Write', windows: windows(25, 38.9, 89, 4, 5, [6.7, 5.3, 13.8]) },
      { id: 'migration', label: 'Migration', secondary: 'Transform', windows: windows(18, 33.3, 74, -3, 8, [-4.8, 2.2, 8.9]) },
      { id: 'incident-response', label: 'Incident response', secondary: 'Operate', windows: windows(14, 27.8, 72, 13, 4, [24.6, 11.4, 16.7]) },
    ],
  },
}

for (const definition of Object.values(DEMO_RANKINGS)) {
  for (const entry of definition.entries) {
    for (const value of Object.values(entry.windows)) {
      if (value.contributors < 5) throw new Error(`${entry.id} is below the demo privacy threshold`)
      if (Math.abs(value.adoptionPct - (value.contributors / value.eligibleContributors) * 100) > .11) {
        throw new Error(`${entry.id} has an inconsistent adoption denominator`)
      }
    }
  }
}
