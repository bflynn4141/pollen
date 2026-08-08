import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeActivity, type ActivitySummary } from './activity.js'
import { computeCoachFindings } from './coach-rules.js'
import {
  initDb,
  insertContribution,
  insertSession,
  insertToolEvent,
  queryIntentDistribution,
  queryToolFrequency,
} from './store.js'
import type {
  CoarsenedToolEvent,
  Contribution,
  Intent,
  SessionRecord,
} from './types.js'

const DAY_MS = 86_400_000

/** Fixed clock: regeneration is byte-for-byte stable across machines and timezones. */
export const DEMO_SNAPSHOT_NOW = Date.UTC(2026, 7, 7, 12)

const INTENT_TOTALS: Array<[Intent, number]> = [
  ['feature_build', 84],
  ['debugging', 60],
  ['refactoring', 36],
  ['testing', 30],
  ['devops', 24],
  ['code_review', 18],
]

const HALF_SESSION_INTENTS: Intent[] = [
  ...Array<Intent>(7).fill('feature_build'),
  ...Array<Intent>(6).fill('debugging'),
  ...Array<Intent>(3).fill('refactoring'),
  ...Array<Intent>(2).fill('testing'),
  ...Array<Intent>(2).fill('devops'),
  'code_review',
]

const INTENT_LABELS: Record<string, string> = {
  feature_build: 'Feature building',
  debugging: 'Debugging',
  refactoring: 'Refactoring',
  testing: 'Testing',
  devops: 'DevOps',
  code_review: 'Code review',
}

const TOOL_LABELS: Record<string, string> = {
  Read: 'Read files',
  Bash: 'Run commands',
  Edit: 'Edit files',
  Search: 'Search code',
}

export interface PersonalDemoSnapshot {
  schemaVersion: 1
  provenance: 'synthetic'
  generatedAt: string
  period: {
    start: string
    end: string
    timezone: 'UTC'
  }
  summary: {
    sessions: number
    prompts: number
    toolCalls: number
    completionPct: number
    avgSatisfaction: number | null
    toolSuccessPct: number
  }
  activity: ActivitySummary
  intents: Array<{ id: string; label: string; count: number; sharePct: number }>
  tools: Array<{ id: string; label: string; count: number; successPct: number }>
  insights: Array<{
    id: string
    headline: string
    whatYouDo: string
    whatToTry: string
    payoff: string
    evidence: Record<string, number | string>
  }>
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function utcDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function promptIntents(): Intent[] {
  const remaining = new Map<Intent, number>(INTENT_TOTALS)
  const intents: Intent[] = []
  while (intents.length < 252) {
    for (const [intent] of INTENT_TOTALS) {
      const count = remaining.get(intent) ?? 0
      if (count > 0) {
        intents.push(intent)
        remaining.set(intent, count - 1)
      }
    }
  }
  return intents
}

function seedSyntheticSessions(now: number) {
  const db = initDb()
  const offsets = Array.from({ length: 49 }, (_, index) => 48 - index)
    .filter(offset => ![5, 12, 19, 26, 33, 40, 47].includes(offset))
  const intents = promptIntents()
  let promptIndex = 0

  for (let sessionIndex = 0; sessionIndex < offsets.length; sessionIndex++) {
    const terse = sessionIndex < 21
    const promptCount = terse ? 5 : 7
    const retryStorm = sessionIndex < 12
    const startedAt = now - offsets[sessionIndex] * DAY_MS - 3 * 60 * 60 * 1000
    const sessionId = `synthetic-session-${String(sessionIndex + 1).padStart(2, '0')}`
    const sessionIntent = HALF_SESSION_INTENTS[sessionIndex % HALF_SESSION_INTENTS.length]
    const satisfaction = terse ? 50 + (sessionIndex % 5) : 86 + (sessionIndex % 5)
    const abandoned = sessionIndex < 9 || sessionIndex === 21
    const toolNames = retryStorm
      ? ['Bash', 'Bash', 'Bash', 'Read', 'Edit', 'Read']
      : ['Read', 'Read', 'Search', 'Edit', 'Bash', 'Read']

    const session: SessionRecord = {
      session_id: sessionId,
      model: sessionIndex % 2 === 0 ? 'claude-sonnet-4-6' : 'gpt-5',
      source: sessionIndex % 2 === 0 ? 'claude-code' : 'codex',
      started_at: startedAt,
      ended_at: startedAt + 42 * 60 * 1000,
      duration_bucket: 'medium',
      prompt_count: promptCount,
      tool_use_count: toolNames.length,
      tool_failure_count: retryStorm ? 3 : 0,
      intent_sequence: JSON.stringify([sessionIntent]),
      dominant_intent: sessionIntent,
      dominant_domain: 'web_frontend',
      unique_tools: JSON.stringify([...new Set(toolNames)]),
      languages_used: JSON.stringify(['typescript']),
      outcome: abandoned ? 'abandoned' : 'completed',
      project_type: 'web_app',
      end_reason: abandoned ? 'user_exit' : 'completed',
      mcp_servers_used: JSON.stringify([]),
      response_count: promptCount,
      avg_response_length: terse ? 540 : 980,
      satisfaction_score: satisfaction,
      satisfaction_signals: JSON.stringify({ no_retry_storms: !retryStorm }),
      subject: null,
      contributor_id: null,
      permission_mode: [1, 15, 29].includes(sessionIndex) ? 'plan' : 'default',
      edit_count: 1,
      read_count: 3,
      search_to_edit_ratio: 1,
      error_recovery_rate: null,
      mcp_tool_count: 0,
      unique_mcp_servers: 0,
      subagent_count: [0, 14, 28].includes(sessionIndex) ? 1 : 0,
      context_compactions: 0,
      transcript_path: null,
    }
    insertSession(db, session)

    for (let sequence = 0; sequence < promptCount; sequence++) {
      const timestamp = startedAt + (sequence + 1) * 5 * 60 * 1000
      const promptIntent = intents[promptIndex++]
      const contribution: Contribution = {
        id: `synthetic-prompt-${String(promptIndex).padStart(3, '0')}`,
        timestamp,
        session_id: sessionId,
        features: {
          keywords: [],
          tools_chain: [],
          language_signals: ['typescript'],
          frameworks: ['nextjs'],
          prompt_length: terse ? 'short' : sequence === 0 ? 'long' : 'medium',
          code_ratio: 'low',
          structure_type: terse ? 'imperative' : sequence === 0 ? 'context_dump' : 'conversation',
          session_depth: sequence === 0 ? 'first' : sequence < 3 ? 'early' : 'mid',
          has_error_trace: false,
          has_code_block: !terse && sequence === 0,
          day_of_week: new Date(timestamp).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase(),
          hour_bucket: 'morning',
        },
        labels: {
          intent: promptIntent,
          complexity: terse ? 'simple' : 'moderate',
          prompt_style: terse ? 'minimal' : 'context_heavy',
          domain: 'web_frontend',
          taxonomy_version: 'v1.0',
          confidence: 0.92,
        },
        action: promptIntent === 'debugging' ? 'fix' : 'build',
        topic: 'product',
        contributor_id: null,
        permission_mode: session.permission_mode,
      }
      insertContribution(db, contribution)
    }

    for (let sequence = 0; sequence < toolNames.length; sequence++) {
      const toolName = toolNames[sequence]
      const failed = retryStorm && sequence < 3
      const event: CoarsenedToolEvent = {
        id: `synthetic-tool-${String(sessionIndex + 1).padStart(2, '0')}-${sequence + 1}`,
        session_id: sessionId,
        timestamp: startedAt + (sequence + 1) * 6 * 60 * 1000,
        tool_name: toolName,
        tool_category: toolName === 'Bash' ? 'execute' : toolName === 'Edit' ? 'write' : 'read',
        success: !failed,
        error_category: failed ? 'test_failure' : null,
        file_extension: toolName === 'Edit' || toolName === 'Read' ? 'ts' : null,
        command_category: toolName === 'Bash' ? 'test' : null,
        sequence_number: sequence,
        mcp_server: null,
        duration_ms: 420 + sequence * 20,
        contributor_id: null,
        response_summary: null,
      }
      insertToolEvent(db, event)
    }
  }

  return db
}

export function buildPersonalDemoSnapshot(now = DEMO_SNAPSHOT_NOW): PersonalDemoSnapshot {
  const db = seedSyntheticSessions(now)
  try {
    const { inputs, findings } = computeCoachFindings(db, { days: 60, now })
    const activity = computeActivity(db, { weeks: 8, now, timezone: 'UTC' })
    const intentRows = queryIntentDistribution(db)
    const toolRows = queryToolFrequency(db)
    const toolCalls = toolRows.reduce((sum, row) => sum + row.count, 0)
    const successfulToolCalls = toolRows.reduce((sum, row) => sum + row.success_count, 0)
    const timestamps = db.prepare(
      'SELECT MIN(timestamp) AS first, MAX(timestamp) AS last FROM contributions',
    ).get() as { first: number; last: number }

    return {
      schemaVersion: 1,
      provenance: 'synthetic',
      generatedAt: new Date(now).toISOString(),
      period: {
        start: utcDate(timestamps.first),
        end: utcDate(now),
        timezone: 'UTC',
      },
      summary: {
        sessions: inputs.promptedSessions,
        prompts: inputs.totalPrompts,
        toolCalls,
        completionPct: inputs.completionPct,
        avgSatisfaction: inputs.avgSatisfaction,
        toolSuccessPct: round1((successfulToolCalls / toolCalls) * 100),
      },
      activity,
      intents: intentRows.map(row => ({
        id: row.intent,
        label: INTENT_LABELS[row.intent] ?? row.intent,
        count: row.count,
        sharePct: round1((row.count / inputs.totalPrompts) * 100),
      })),
      tools: toolRows.map(row => ({
        id: row.tool_name.toLowerCase(),
        label: TOOL_LABELS[row.tool_name] ?? row.tool_name,
        count: row.count,
        successPct: round1((row.success_count / row.count) * 100),
      })),
      insights: findings.slice(0, 3).map(finding => ({
        id: finding.id,
        headline: finding.headline,
        whatYouDo: finding.what_you_do,
        whatToTry: finding.what_to_try,
        payoff: finding.payoff,
        evidence: finding.evidence,
      })),
    }
  } finally {
    db.close()
  }
}

export function writePersonalDemoSnapshot(outputPath: string): PersonalDemoSnapshot {
  const snapshot = buildPersonalDemoSnapshot()
  const absolutePath = resolve(outputPath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, `${JSON.stringify(snapshot, null, 2)}\n`)
  return snapshot
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === fileURLToPath(import.meta.url)) {
  const defaultPath = fileURLToPath(new URL('../../site/src/data/demo-personal.json', import.meta.url))
  const outputPath = process.argv[2] ?? defaultPath
  const snapshot = writePersonalDemoSnapshot(outputPath)
  process.stdout.write(
    `Wrote ${snapshot.summary.sessions} synthetic sessions to ${resolve(outputPath)}\n`,
  )
}
