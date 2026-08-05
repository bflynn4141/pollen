/**
 * V4 Seed Data Generator
 *
 * Creates 20 realistic sessions with fully populated v4 fields for demo/testing.
 * All IDs use `seed-*` prefix for easy cleanup.
 *
 * Usage: pollen seed
 */
import type Database from 'better-sqlite3'
import {
  insertContribution, insertToolEvent, insertSession, insertLifecycleEvent,
  type LifecycleEvent,
} from './store.js'
import { inferResponseType } from './coarsen.js'
import type {
  Contribution, CoarsenedToolEvent, SessionRecord,
  Intent, Domain, DurationBucket, SessionOutcome, ToolCategory,
  Complexity, PromptStyle, PromptLength, CodeRatio, StructureType,
  SessionDepth, HourBucket, CommandCategory, ErrorCategory,
} from './types.js'

// ── Helpers ──

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ── Duration → millisecond ranges ──

const DURATION_RANGES: Record<DurationBucket, [number, number]> = {
  quick:    [2 * 60_000,   10 * 60_000],
  short:    [10 * 60_000,  30 * 60_000],
  medium:   [30 * 60_000,  90 * 60_000],
  long:     [90 * 60_000, 180 * 60_000],
  marathon: [180 * 60_000, 360 * 60_000],
}

const PROMPT_RANGES: Record<DurationBucket, [number, number]> = {
  quick:    [3, 5],
  short:    [5, 8],
  medium:   [8, 12],
  long:     [12, 18],
  marathon: [18, 25],
}

const TOOL_RANGES: Record<DurationBucket, [number, number]> = {
  quick:    [10, 15],
  short:    [12, 20],
  medium:   [20, 35],
  long:     [30, 45],
  marathon: [40, 50],
}

// ── MCP tool mapping (from real usage) ──

const MCP_TOOLS: Record<string, string[]> = {
  clara:              ['wallet_session', 'wallet_dashboard', 'wallet_send', 'wallet_sign', 'wallet_reauth'],
  herd:               ['getWalletOverviewTool'],
  figma:              ['get_design_context', 'get_screenshot'],
  paper:              ['write_html', 'create_artboard', 'get_screenshot', 'get_basic_info', 'get_font_family_info'],
  signal402:          ['signal402_call', 'signal402_probe', 'signal402_recommend'],
  vibe:               ['vibe_chat', 'vibe_status'],
  glorp:              ['glorp_send_message', 'glorp_status'],
  'conway-terminal':  ['sandbox_exec'],
  typefully:          ['typefully_create_draft'],
  paymodel:           ['paymodel_chat'],
}

// ── Built-in tool weights (matching real frequency) ──

interface WeightedTool { name: string; weight: number; category: ToolCategory }
const BUILTIN_TOOLS: WeightedTool[] = [
  { name: 'Bash',      weight: 30, category: 'execute' },
  { name: 'Read',      weight: 30, category: 'read' },
  { name: 'Edit',      weight: 10, category: 'write' },
  { name: 'Grep',      weight: 5,  category: 'search' },
  { name: 'Write',     weight: 5,  category: 'write' },
  { name: 'Glob',      weight: 2,  category: 'search' },
  { name: 'WebSearch',  weight: 2,  category: 'web' },
]
const TOTAL_BUILTIN_WEIGHT = BUILTIN_TOOLS.reduce((s, t) => s + t.weight, 0)

function pickWeightedTool(): WeightedTool {
  let r = Math.random() * TOTAL_BUILTIN_WEIGHT
  for (const tool of BUILTIN_TOOLS) {
    r -= tool.weight
    if (r <= 0) return tool
  }
  return BUILTIN_TOOLS[0]
}

// ── Contributors (simulate a multi-user network) ──

const CONTRIBUTORS = [
  'brian-primary',   // 5 sessions (001-005)
  'alex-dev',        // 3 sessions (006-008)
  'maria-eng',       // 3 sessions (009-011)
  'sam-ops',         // 3 sessions (012-014)
  'jordan-build',    // 3 sessions (015-017)
  'casey-explore',   // 3 sessions (018-020)
] as const

// Map session index → contributor
function contributorForIndex(i: number): string {
  if (i < 5) return CONTRIBUTORS[0]
  if (i < 8) return CONTRIBUTORS[1]
  if (i < 11) return CONTRIBUTORS[2]
  if (i < 14) return CONTRIBUTORS[3]
  if (i < 17) return CONTRIBUTORS[4]
  return CONTRIBUTORS[5]
}

// ── Session profiles ──

interface SessionProfile {
  id: string
  subject: string
  intent: Intent
  subIntent: string
  domain: Domain
  duration: DurationBucket
  outcome: SessionOutcome
  permission: string
  mcpServers: string[]
  subagents: number
  compactions: number
  satisfaction: number
  keywords: string[]
  languages: string[]
  frameworks: string[]
  topics: string[]
  actions: string[]
}

const PROFILES: SessionProfile[] = [
  {
    id: 'seed-001', subject: 'Fix wallet connection timeout',
    intent: 'debugging', subIntent: 'timeout', domain: 'general', duration: 'medium',
    outcome: 'completed', permission: 'default', mcpServers: ['clara', 'herd'],
    subagents: 0, compactions: 0, satisfaction: 85,
    keywords: ['wallet', 'timeout', 'connection', 'rpc'], languages: ['typescript'],
    frameworks: ['viem'], topics: ['web3', 'network'], actions: ['fix'],
  },
  {
    id: 'seed-002', subject: 'Build session analytics dashboard',
    intent: 'feature_build', subIntent: 'dashboard', domain: 'web_frontend', duration: 'long',
    outcome: 'completed', permission: 'bypassPermissions', mcpServers: ['figma', 'paper'],
    subagents: 2, compactions: 1, satisfaction: 92,
    keywords: ['dashboard', 'analytics', 'chart', 'react'], languages: ['typescript', 'tsx', 'css'],
    frameworks: ['React', 'Ink'], topics: ['ui', 'data'], actions: ['create'],
  },
  {
    id: 'seed-003', subject: 'Refactor MCP tool registry',
    intent: 'refactoring', subIntent: 'registry', domain: 'web_backend', duration: 'medium',
    outcome: 'completed', permission: 'default', mcpServers: [],
    subagents: 0, compactions: 0, satisfaction: 78,
    keywords: ['mcp', 'registry', 'refactor', 'tools'], languages: ['typescript'],
    frameworks: ['Node'], topics: ['ai', 'api'], actions: ['refactor'],
  },
  {
    id: 'seed-004', subject: 'Debug ENS resolution failure',
    intent: 'debugging', subIntent: 'resolution_failure', domain: 'general', duration: 'short',
    outcome: 'completed', permission: 'default', mcpServers: ['clara', 'herd', 'conway-terminal'],
    subagents: 0, compactions: 0, satisfaction: 70,
    keywords: ['ens', 'resolution', 'ccip', 'gateway'], languages: ['typescript'],
    frameworks: ['viem'], topics: ['web3', 'network'], actions: ['fix'],
  },
  {
    id: 'seed-005', subject: 'Deploy indexer to Railway',
    intent: 'devops', subIntent: 'railway_deploy', domain: 'devops', duration: 'quick',
    outcome: 'completed', permission: 'default', mcpServers: [],
    subagents: 0, compactions: 0, satisfaction: 95,
    keywords: ['deploy', 'railway', 'indexer', 'postgres'], languages: ['typescript', 'yaml'],
    frameworks: ['Railway', 'Ponder'], topics: ['infra'], actions: ['deploy'],
  },
  {
    id: 'seed-006', subject: 'Add lifecycle event tracking',
    intent: 'feature_build', subIntent: 'event_tracking', domain: 'web_backend', duration: 'long',
    outcome: 'completed', permission: 'bypassPermissions', mcpServers: ['vibe', 'glorp'],
    subagents: 1, compactions: 0, satisfaction: 88,
    keywords: ['lifecycle', 'events', 'tracking', 'hooks'], languages: ['typescript'],
    frameworks: ['Node', 'SQLite'], topics: ['data', 'api'], actions: ['create'],
  },
  {
    id: 'seed-007', subject: 'Explore x402 payment protocol',
    intent: 'exploration', subIntent: 'protocol_research', domain: 'general', duration: 'medium',
    outcome: 'completed', permission: 'plan', mcpServers: ['signal402', 'paymodel'],
    subagents: 0, compactions: 0, satisfaction: 65,
    keywords: ['x402', 'payment', 'protocol', 'micropayment'], languages: ['typescript'],
    frameworks: [], topics: ['payments', 'web3'], actions: ['understand'],
  },
  {
    id: 'seed-008', subject: 'Write seed data generator',
    intent: 'feature_build', subIntent: 'seed_data', domain: 'data', duration: 'marathon',
    outcome: 'completed', permission: 'bypassPermissions', mcpServers: [],
    subagents: 3, compactions: 3, satisfaction: 90,
    keywords: ['seed', 'generator', 'data', 'demo'], languages: ['typescript'],
    frameworks: ['SQLite'], topics: ['data', 'cli'], actions: ['create'],
  },
  {
    id: 'seed-009', subject: 'Fix CSS grid layout regression',
    intent: 'debugging', subIntent: 'css_regression', domain: 'web_frontend', duration: 'short',
    outcome: 'completed', permission: 'default', mcpServers: ['figma'],
    subagents: 0, compactions: 0, satisfaction: 82,
    keywords: ['css', 'grid', 'layout', 'regression'], languages: ['typescript', 'css', 'tsx'],
    frameworks: ['React', 'Tailwind'], topics: ['ui'], actions: ['fix'],
  },
  {
    id: 'seed-010', subject: 'Set up CI/CD pipeline',
    intent: 'devops', subIntent: 'ci_cd', domain: 'devops', duration: 'medium',
    outcome: 'completed', permission: 'default', mcpServers: ['conway-terminal'],
    subagents: 0, compactions: 0, satisfaction: 75,
    keywords: ['ci', 'cd', 'pipeline', 'github-actions'], languages: ['yaml', 'typescript'],
    frameworks: ['GitHub Actions'], topics: ['infra', 'build'], actions: ['setup'],
  },
  {
    id: 'seed-011', subject: 'Learn Solidity basics',
    intent: 'learning', subIntent: 'solidity', domain: 'general', duration: 'long',
    outcome: 'abandoned', permission: 'plan', mcpServers: [],
    subagents: 0, compactions: 1, satisfaction: 45,
    keywords: ['solidity', 'smart-contract', 'evm', 'learn'], languages: ['solidity'],
    frameworks: ['Foundry'], topics: ['web3'], actions: ['understand'],
  },
  {
    id: 'seed-012', subject: 'Review PR for auth middleware',
    intent: 'code_review', subIntent: 'auth_middleware', domain: 'web_backend', duration: 'short',
    outcome: 'completed', permission: 'acceptEdits', mcpServers: ['glorp', 'vibe'],
    subagents: 0, compactions: 0, satisfaction: 80,
    keywords: ['review', 'pr', 'auth', 'middleware'], languages: ['typescript'],
    frameworks: ['Express'], topics: ['auth', 'api'], actions: ['review'],
  },
  {
    id: 'seed-013', subject: 'Add unit tests for classifier',
    intent: 'testing', subIntent: 'unit_tests', domain: 'data', duration: 'medium',
    outcome: 'completed', permission: 'default', mcpServers: [],
    subagents: 0, compactions: 0, satisfaction: 87,
    keywords: ['test', 'unit', 'classifier', 'vitest'], languages: ['typescript'],
    frameworks: ['Vitest'], topics: ['testing'], actions: ['test'],
  },
  {
    id: 'seed-014', subject: 'Document API endpoints',
    intent: 'documentation', subIntent: 'api_docs', domain: 'web_backend', duration: 'short',
    outcome: 'completed', permission: 'default', mcpServers: ['typefully'],
    subagents: 0, compactions: 0, satisfaction: 73,
    keywords: ['docs', 'api', 'endpoints', 'openapi'], languages: ['typescript', 'markdown'],
    frameworks: [], topics: ['docs', 'api'], actions: ['create'],
  },
  {
    id: 'seed-015', subject: 'Build multi-chain wallet view',
    intent: 'feature_build', subIntent: 'wallet_view', domain: 'web_frontend', duration: 'long',
    outcome: 'completed', permission: 'bypassPermissions',
    mcpServers: ['clara', 'herd', 'figma', 'paper', 'signal402', 'vibe'],
    subagents: 4, compactions: 2, satisfaction: 93,
    keywords: ['multi-chain', 'wallet', 'view', 'dashboard'], languages: ['typescript', 'tsx', 'css'],
    frameworks: ['React', 'viem', 'Ink'], topics: ['web3', 'ui'], actions: ['create'],
  },
  {
    id: 'seed-016', subject: 'Debug flaky test in hook',
    intent: 'debugging', subIntent: 'flaky_test', domain: 'data', duration: 'medium',
    outcome: 'completed', permission: 'default', mcpServers: [],
    subagents: 0, compactions: 0, satisfaction: 68,
    keywords: ['flaky', 'test', 'hook', 'race-condition'], languages: ['typescript'],
    frameworks: ['Vitest'], topics: ['testing', 'errors'], actions: ['fix'],
  },
  {
    id: 'seed-017', subject: 'Refactor store queries',
    intent: 'refactoring', subIntent: 'queries', domain: 'web_backend', duration: 'medium',
    outcome: 'completed', permission: 'acceptEdits', mcpServers: [],
    subagents: 1, compactions: 0, satisfaction: 84,
    keywords: ['store', 'queries', 'sql', 'refactor'], languages: ['typescript'],
    frameworks: ['SQLite'], topics: ['database'], actions: ['refactor'],
  },
  {
    id: 'seed-018', subject: 'Investigate memory leak',
    intent: 'exploration', subIntent: 'investigation', domain: 'systems', duration: 'long',
    outcome: 'error_exit', permission: 'default', mcpServers: ['conway-terminal', 'clara'],
    subagents: 0, compactions: 1, satisfaction: 40,
    keywords: ['memory', 'leak', 'heap', 'profiling'], languages: ['typescript'],
    frameworks: [], topics: ['performance'], actions: ['understand'],
  },
  {
    id: 'seed-019', subject: 'Build Figma-to-code pipeline',
    intent: 'feature_build', subIntent: 'pipeline', domain: 'web_frontend', duration: 'marathon',
    outcome: 'completed', permission: 'bypassPermissions',
    mcpServers: ['figma', 'paper', 'clara', 'herd', 'glorp', 'typefully', 'paymodel'],
    subagents: 5, compactions: 2, satisfaction: 96,
    keywords: ['figma', 'code-gen', 'pipeline', 'design-system'], languages: ['typescript', 'tsx', 'css'],
    frameworks: ['React', 'Tailwind', 'Ink'], topics: ['design', 'ui', 'ai'], actions: ['create'],
  },
  {
    id: 'seed-020', subject: 'Set up monitoring alerts',
    intent: 'devops', subIntent: 'monitoring', domain: 'devops', duration: 'short',
    outcome: 'abandoned', permission: 'plan', mcpServers: ['conway-terminal', 'vibe'],
    subagents: 0, compactions: 0, satisfaction: 52,
    keywords: ['monitoring', 'alerts', 'observability', 'metrics'], languages: ['yaml', 'typescript'],
    frameworks: ['Grafana'], topics: ['infra', 'performance'], actions: ['setup'],
  },
]

// ── Satisfaction signal generator ──

function generateSatisfactionSignals(score: number, outcome: SessionOutcome): Record<string, boolean> {
  const signals: Record<string, boolean> = {
    git_activity: false,
    low_failure_rate: false,
    no_retry_storms: false,
    reasonable_duration: false,
    tool_engagement: false,
    consistent_intent: false,
    clean_ending: false,
  }

  let remaining = score
  if (remaining >= 25) { signals.low_failure_rate = true; remaining -= 25 }
  if (remaining >= 15 && Math.random() > 0.3) { signals.no_retry_storms = true; remaining -= 15 }
  if (remaining >= 15 && Math.random() > 0.2) { signals.tool_engagement = true; remaining -= 15 }
  if (remaining >= 15 && Math.random() > 0.3) { signals.git_activity = true; remaining -= 15 }
  if (remaining >= 10) { signals.reasonable_duration = true; remaining -= 10 }
  if (remaining >= 10) { signals.consistent_intent = true; remaining -= 10 }
  if (outcome === 'completed' && remaining >= 5) { signals.clean_ending = true }

  return signals
}

// ── Time helpers ──

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

function dayOfWeek(ts: number): string {
  return DAYS[new Date(ts).getDay()]
}

function hourBucket(ts: number): HourBucket {
  const h = new Date(ts).getHours()
  if (h >= 6 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  if (h >= 17 && h < 22) return 'evening'
  return 'night'
}

// ── Generate tool events for a session ──

function generateToolEvents(
  profile: SessionProfile,
  sessionStart: number,
  sessionEnd: number,
  contributorId: string,
): CoarsenedToolEvent[] {
  const [minTools, maxTools] = TOOL_RANGES[profile.duration]
  const count = rand(minTools, maxTools)
  const events: CoarsenedToolEvent[] = []
  const timeSpan = sessionEnd - sessionStart

  // Allocate special tool slots
  const mcpCallCount = profile.mcpServers.length > 0
    ? rand(Math.ceil(profile.mcpServers.length * 1.5), profile.mcpServers.length * 3)
    : 0
  const taskCallCount = profile.subagents > 0 ? profile.subagents * 2 : 0
  const toolSearchCount = profile.mcpServers.length > 0 ? rand(1, 2) : 0

  const COMMAND_CATS: CommandCategory[] = ['test', 'build', 'git', 'run', 'install', 'lint']
  const ERROR_CATS: ErrorCategory[] = ['syntax', 'runtime', 'not_found', 'permission']
  const FILE_EXTS = ['.ts', '.tsx', '.json', '.md', '.css', '.yaml'] as const

  for (let i = 0; i < count; i++) {
    const timestamp = sessionStart + Math.round(((i + 0.5) / count) * timeSpan) + rand(-2000, 2000)

    let toolName: string
    let toolCategory: ToolCategory
    let mcpServer: string | null = null
    let commandCategory: CommandCategory | null = null
    let fileExtension: string | null = null

    if (i < toolSearchCount) {
      toolName = 'ToolSearch'
      toolCategory = 'search'
    } else if (i < toolSearchCount + taskCallCount) {
      toolName = pick(['Task', 'TaskCreate', 'TaskUpdate', 'TaskList'] as const)
      toolCategory = 'execute'
    } else if (i >= count - mcpCallCount) {
      const server = profile.mcpServers[(i - (count - mcpCallCount)) % profile.mcpServers.length]
      const tools = MCP_TOOLS[server] ?? ['unknown_tool']
      toolName = `mcp__${server}__${pick(tools)}`
      toolCategory = 'interact'
      mcpServer = server
    } else {
      const selected = pickWeightedTool()
      toolName = selected.name
      toolCategory = selected.category

      if (toolName === 'Bash') commandCategory = pick(COMMAND_CATS)
      if (toolCategory === 'read' || toolCategory === 'write' || toolCategory === 'search') {
        fileExtension = pick(FILE_EXTS)
      }
    }

    const success = Math.random() > 0.08
    const responseType = inferResponseType(toolName)

    events.push({
      id: `${profile.id}-tool-${String(i).padStart(3, '0')}`,
      session_id: profile.id,
      timestamp,
      tool_name: toolName,
      tool_category: toolCategory,
      success,
      error_category: success ? null : pick(ERROR_CATS),
      file_extension: fileExtension,
      command_category: commandCategory,
      sequence_number: i,
      mcp_server: mcpServer,
      duration_ms: rand(50, 5000),
      contributor_id: contributorId,
      response_type: responseType,
      response_size: rand(100, 10000),
      response_file_paths: toolCategory === 'search' ? rand(1, 20) : null,
      response_has_code: toolCategory === 'write' || toolCategory === 'read',
      response_has_error: !success,
      response_summary: null,
    })
  }

  return events
}

// ── Generate contributions for a session ──

function generateContributions(
  profile: SessionProfile,
  sessionStart: number,
  sessionEnd: number,
  contributorId: string,
): Contribution[] {
  const [minPrompts, maxPrompts] = PROMPT_RANGES[profile.duration]
  const count = rand(minPrompts, maxPrompts)
  const contributions: Contribution[] = []
  const timeSpan = sessionEnd - sessionStart

  const COMPLEXITIES: Complexity[] = ['simple', 'moderate', 'complex']
  const STYLES: PromptStyle[] = ['directive', 'conversational', 'context_heavy', 'minimal']
  const LENGTHS: PromptLength[] = ['short', 'medium', 'long']
  const CODE_RATIOS: CodeRatio[] = ['none', 'low', 'medium', 'high']
  const STRUCTURES: StructureType[] = ['imperative', 'question', 'error_paste', 'context_dump', 'conversation']

  for (let i = 0; i < count; i++) {
    const timestamp = sessionStart + Math.round(((i + 0.5) / count) * timeSpan) + rand(-1000, 1000)
    const depth: SessionDepth = i === 0 ? 'first' : i <= 2 ? 'early' : i <= count * 0.6 ? 'mid' : 'deep'

    contributions.push({
      id: `${profile.id}-contrib-${String(i).padStart(3, '0')}`,
      timestamp,
      session_id: profile.id,
      features: {
        keywords: profile.keywords.slice(0, rand(2, Math.min(4, profile.keywords.length))),
        tools_chain: [],
        language_signals: profile.languages,
        frameworks: profile.frameworks,
        prompt_length: pick(LENGTHS),
        code_ratio: pick(CODE_RATIOS),
        structure_type: i === 0 ? 'imperative' : pick(STRUCTURES),
        session_depth: depth,
        has_error_trace: profile.intent === 'debugging' && Math.random() > 0.5,
        has_code_block: Math.random() > 0.4,
        day_of_week: dayOfWeek(timestamp),
        hour_bucket: hourBucket(timestamp),
      },
      labels: {
        intent: profile.intent,
        sub_intent: profile.subIntent,
        complexity: pick(COMPLEXITIES),
        prompt_style: pick(STYLES),
        domain: profile.domain,
        taxonomy_version: 'v1.0',
        confidence: parseFloat((0.7 + Math.random() * 0.3).toFixed(2)),
      },
      action: pick(profile.actions),
      topic: pick(profile.topics),
      contributor_id: contributorId,
      permission_mode: profile.permission,
    })
  }

  return contributions
}

// ── Generate lifecycle events ──

function generateLifecycleEvents(
  profile: SessionProfile,
  sessionStart: number,
  sessionEnd: number,
  contributorId: string,
): LifecycleEvent[] {
  const events: LifecycleEvent[] = []
  const timeSpan = sessionEnd - sessionStart

  // Subagent start/stop pairs
  for (let i = 0; i < profile.subagents; i++) {
    const startTime = sessionStart + Math.round(((i + 1) / (profile.subagents + 2)) * timeSpan)
    const startId = `${profile.id}-lc-substart-${i}`

    events.push({
      id: startId,
      session_id: profile.id,
      timestamp: startTime,
      event_type: 'SubagentStart',
      metadata: JSON.stringify({ agent_name: `agent-${i}`, agent_type: 'general-purpose' }),
      contributor_id: contributorId,
    })

    events.push({
      id: `${profile.id}-lc-substop-${i}`,
      session_id: profile.id,
      timestamp: startTime + rand(30_000, 120_000),
      event_type: 'SubagentStop',
      parent_event_id: startId,
      metadata: JSON.stringify({ agent_name: `agent-${i}` }),
      contributor_id: contributorId,
    })
  }

  // Compaction events
  for (let i = 0; i < profile.compactions; i++) {
    const compactTime = sessionStart + Math.round(((i + 1) / (profile.compactions + 1)) * timeSpan)
    events.push({
      id: `${profile.id}-lc-compact-${i}`,
      session_id: profile.id,
      timestamp: compactTime,
      event_type: 'PreCompact',
      metadata: JSON.stringify({ context_size: rand(100_000, 200_000), conversation_length: rand(50, 150) }),
      contributor_id: contributorId,
    })
  }

  return events
}

// ── Main seed function ──

export function seedV4(db: Database.Database): {
  sessions: number
  contributions: number
  toolEvents: number
  lifecycleEvents: number
} {
  // Step 1: Clean existing seed/test data
  for (const table of ['sessions', 'contributions', 'tool_events', 'lifecycle_events']) {
    db.prepare(`DELETE FROM ${table} WHERE session_id LIKE 'seed-%' OR session_id LIKE 'test-%'`).run()
  }

  let totalContributions = 0
  let totalToolEvents = 0
  let totalLifecycleEvents = 0

  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

  // Step 2: Generate everything inside a transaction for speed
  const seed = db.transaction(() => {
    for (let idx = 0; idx < PROFILES.length; idx++) {
      const profile = PROFILES[idx]
      const contributorId = contributorForIndex(idx)

      // Spread sessions across last 7 days
      const baseTime = sevenDaysAgo + Math.random() * (now - sevenDaysAgo)

      const [minDur, maxDur] = DURATION_RANGES[profile.duration]
      const durationMs = rand(minDur, maxDur)
      const sessionStart = baseTime
      const sessionEnd = profile.outcome === 'abandoned'
        ? sessionStart + Math.round(durationMs * 0.6)
        : sessionStart + durationMs

      // Generate child records
      const toolEvents = generateToolEvents(profile, sessionStart, sessionEnd, contributorId)
      const contributions = generateContributions(profile, sessionStart, sessionEnd, contributorId)
      const lifecycleEvents = generateLifecycleEvents(profile, sessionStart, sessionEnd, contributorId)

      // Derive session metrics from tool events
      const editCount = toolEvents.filter(e => e.tool_category === 'write').length
      const readCount = toolEvents.filter(e => e.tool_category === 'read' || e.tool_category === 'search').length
      const searchToEditRatio = parseFloat((readCount / (editCount + 1)).toFixed(1))
      const failureCount = toolEvents.filter(e => !e.success).length
      const errorRecoveryRate = failureCount > 0
        ? parseFloat((0.5 + Math.random() * 0.5).toFixed(2))
        : null
      const mcpToolCount = toolEvents.filter(e => e.mcp_server !== null).length
      const uniqueMcpServers = new Set(toolEvents.filter(e => e.mcp_server).map(e => e.mcp_server)).size

      const intentSeq = contributions.map(c => c.labels.intent)
      const uniqueTools = [...new Set(toolEvents.map(e => e.tool_name))]

      // Insert session record
      const session: SessionRecord = {
        session_id: profile.id,
        model: 'claude-opus-4-6',
        source: 'claude-code',
        started_at: sessionStart,
        ended_at: sessionEnd,
        duration_bucket: profile.duration,
        prompt_count: contributions.length,
        tool_use_count: toolEvents.length,
        tool_failure_count: failureCount,
        intent_sequence: JSON.stringify(intentSeq),
        dominant_intent: profile.intent,
        dominant_domain: profile.domain,
        unique_tools: JSON.stringify(uniqueTools),
        languages_used: JSON.stringify(profile.languages),
        outcome: profile.outcome,
        project_type: 'node',
        end_reason: profile.outcome === 'completed' ? 'natural'
          : profile.outcome === 'abandoned' ? 'user_quit' : 'error',
        mcp_servers_used: profile.mcpServers.length > 0
          ? JSON.stringify(profile.mcpServers) : null,
        response_count: contributions.length,
        avg_response_length: rand(500, 3000),
        satisfaction_score: profile.satisfaction,
        satisfaction_signals: JSON.stringify(
          generateSatisfactionSignals(profile.satisfaction, profile.outcome),
        ),
        subject: profile.subject,
        contributor_id: contributorId,
        edit_count: editCount,
        read_count: readCount,
        search_to_edit_ratio: searchToEditRatio,
        error_recovery_rate: errorRecoveryRate,
        mcp_tool_count: mcpToolCount,
        unique_mcp_servers: uniqueMcpServers,
        permission_mode: profile.permission,
        subagent_count: profile.subagents,
        context_compactions: profile.compactions,
      }

      insertSession(db, session)

      for (const event of toolEvents) insertToolEvent(db, event)
      for (const contrib of contributions) insertContribution(db, contrib)
      for (const lc of lifecycleEvents) insertLifecycleEvent(db, lc)

      totalContributions += contributions.length
      totalToolEvents += toolEvents.length
      totalLifecycleEvents += lifecycleEvents.length
    }
  })

  seed()

  return {
    sessions: PROFILES.length,
    contributions: totalContributions,
    toolEvents: totalToolEvents,
    lifecycleEvents: totalLifecycleEvents,
  }
}
