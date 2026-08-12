import {
  assertNetworkDemoSnapshot,
  type NetworkDemoSnapshot,
} from '@/lib/demo-contract'

export const DEMO_NETWORK_SNAPSHOT = {
  schemaVersion: 2,
  provenance: 'synthetic',
  generatedAt: '2026-08-07T12:00:00.000Z',
  period: {
    start: '2026-07-27',
    end: '2026-08-02',
    timezone: 'UTC',
    cadence: 'static founding snapshot',
  },
  privacy: {
    aggregation: 'contributor-thresholded rollups',
    minContributorsPerCell: 5,
    containsRawPrompts: false,
    containsUserIdentifiers: false,
    compositionAudit: 'passed',
    immutablePublishedSnapshot: true,
  },
  panel: {
    label: 'Founding panel simulation',
    totalContributors: 18,
    eligibleContributors: 18,
    ecosystems: 2,
    description: 'Illustrative developer panel using Claude Code and Codex on macOS.',
  },
  summary: {
    contributors: 18,
    sessions: 326,
    toolCalls: 2_458,
    publishedCells: 28,
    suppressedCells: 9,
  },
  models: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'Anthropic', contributors: 14, eligibleContributors: 18, sessions: 112, adoptionPct: 77.8, completionPct: 82 },
    { id: 'gpt-5-2-codex', label: 'GPT-5.2 Codex', provider: 'OpenAI', contributors: 12, eligibleContributors: 18, sessions: 95, adoptionPct: 66.7, completionPct: 79 },
    { id: 'claude-opus-4-1', label: 'Claude Opus 4.1', provider: 'Anthropic', contributors: 9, eligibleContributors: 18, sessions: 68, adoptionPct: 50, completionPct: 86 },
    { id: 'gpt-5-2', label: 'GPT-5.2', provider: 'OpenAI', contributors: 7, eligibleContributors: 18, sessions: 51, adoptionPct: 38.9, completionPct: 75 },
  ],
  tools: [
    { id: 'shell', label: 'Shell execution', category: 'Execute', contributors: 17, eligibleContributors: 18, calls: 1_110, adoptionPct: 94.4 },
    { id: 'read-search', label: 'Read + search', category: 'Read', contributors: 16, eligibleContributors: 18, calls: 774, adoptionPct: 88.9 },
    { id: 'edit-write', label: 'Edit + write', category: 'Write', contributors: 15, eligibleContributors: 18, calls: 378, adoptionPct: 83.3 },
    { id: 'github-mcp', label: 'GitHub MCP', category: 'Interact', contributors: 10, eligibleContributors: 18, calls: 126, adoptionPct: 55.6 },
    { id: 'playwright', label: 'Playwright', category: 'Interact', contributors: 7, eligibleContributors: 18, calls: 70, adoptionPct: 38.9 },
  ],
  intents: [
    { id: 'feature_build', label: 'Feature build', sessions: 132, contributors: 16, sharePct: 40.5, toolMix: [{ category: 'Read', sharePct: 24 }, { category: 'Execute', sharePct: 38 }, { category: 'Write', sharePct: 29 }, { category: 'Interact', sharePct: 9 }] },
    { id: 'debugging', label: 'Debugging', sessions: 78, contributors: 14, sharePct: 23.9, toolMix: [{ category: 'Read', sharePct: 31 }, { category: 'Execute', sharePct: 43 }, { category: 'Write', sharePct: 18 }, { category: 'Interact', sharePct: 8 }] },
    { id: 'code_review', label: 'Code review', sessions: 46, contributors: 12, sharePct: 14.1, toolMix: [{ category: 'Read', sharePct: 47 }, { category: 'Execute', sharePct: 12 }, { category: 'Write', sharePct: 9 }, { category: 'Interact', sharePct: 32 }] },
    { id: 'testing', label: 'Testing', sessions: 41, contributors: 11, sharePct: 12.6, toolMix: [{ category: 'Read', sharePct: 18 }, { category: 'Execute', sharePct: 57 }, { category: 'Write', sharePct: 15 }, { category: 'Interact', sharePct: 10 }] },
    { id: 'exploration', label: 'Exploration', sessions: 29, contributors: 8, sharePct: 8.9, toolMix: [{ category: 'Read', sharePct: 42 }, { category: 'Execute', sharePct: 23 }, { category: 'Write', sharePct: 12 }, { category: 'Interact', sharePct: 23 }] },
  ],
  workflows: [
    { id: 'inspect-edit-test', label: 'Implementation loop', sequence: ['inspect', 'edit', 'test'], sessions: 84, contributors: 16, completionPct: 86, checkPassPct: 79, evidence: 'observed' },
    { id: 'search-read-edit', label: 'Codebase navigation', sequence: ['search', 'read', 'edit'], sessions: 62, contributors: 14, completionPct: 82, checkPassPct: 74, evidence: 'observed' },
    { id: 'plan-code-pr', label: 'Issue to pull request', sequence: ['plan', 'code', 'test', 'PR'], sessions: 48, contributors: 11, completionPct: 88, checkPassPct: 82, evidence: 'observed' },
    { id: 'error-search-fix', label: 'Debugging loop', sequence: ['error', 'search', 'fix', 'test'], sessions: 42, contributors: 12, completionPct: 76, checkPassPct: 68, evidence: 'observed' },
    { id: 'research-plan-build', label: 'Research to build', sequence: ['research', 'plan', 'implement'], sessions: 31, contributors: 8, completionPct: 71, checkPassPct: null, evidence: 'inferred-high' },
  ],
  egressManifest: [
    { field: 'intent', example: 'feature_build', evidence: 'inferred-high' },
    { field: 'agent + model ID', example: 'codex / gpt-5.2-codex', evidence: 'observed' },
    { field: 'tool category sequence', example: 'read → write → execute', evidence: 'observed' },
    { field: 'duration bucket', example: '10–30 minutes', evidence: 'observed' },
    { field: 'terminal state', example: 'completed', evidence: 'reported' },
    { field: 'check result', example: 'passed', evidence: 'observed' },
  ],
  excludedFields: [
    'Raw prompts',
    'Tool arguments',
    'Source code and files',
    'Screenshots and clipboard',
    'Commands and shell output',
    'Credentials and identifiers',
  ],
} as const satisfies NetworkDemoSnapshot

assertNetworkDemoSnapshot(DEMO_NETWORK_SNAPSHOT)
