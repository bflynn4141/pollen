import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { COPPER, GOLD, MUTED, TEXT_DIM, SUCCESS, syncIndicator, BOX } from './theme.js'
import type { SessionToolSummaryRow, FieldCountRow } from '../store.js'

interface SessionInfo {
  session_id: string
  started_at: number
  ended_at: number | null
  subject: string | null
  satisfaction_score: number | null
  satisfaction_signals: string | null
  outcome: string | null
  languages_used: string | null
  unique_tools: string | null
  mcp_servers_used: string | null
  dominant_intent: string | null
  model: string | null
  end_reason: string | null
  duration_bucket: string | null
  response_count: number
  avg_response_length: number
  intent_sequence: string | null
  // v4 fields (optional — older sessions may not have these)
  permission_mode?: string | null
  edit_count?: number
  read_count?: number
  search_to_edit_ratio?: number | null
  error_recovery_rate?: number | null
  mcp_tool_count?: number
  unique_mcp_servers?: number
  subagent_count?: number
  context_compactions?: number
}

interface Props {
  session: SessionInfo
  contributions: Record<string, unknown>[]
  toolSummary: SessionToolSummaryRow[]
  fieldCounts: Record<string, FieldCountRow[]>
  onBack: () => void
  onQuit: () => void
}

// ── Helpers ──

function formatDate(ts: number): string {
  const d = new Date(ts)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[d.getMonth()]} ${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatDuration(start: number, end: number | null): string {
  if (!end) return 'ongoing'
  const mins = Math.round((end - start) / 60000)
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function tryParseJson(val: unknown): string {
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed.join(', ')
      return JSON.stringify(parsed)
    } catch { return val }
  }
  if (val === null || val === undefined) return '—'
  return String(val)
}

/** Friendly names for satisfaction signals */
const SIGNAL_LABELS: Record<string, { label: string; weight: number }> = {
  git_activity:      { label: 'Git activity',       weight: 15 },
  low_failure_rate:  { label: 'Low failure rate',   weight: 25 },
  no_retry_storms:   { label: 'No retry storms',    weight: 15 },
  reasonable_duration:{ label: 'Reasonable duration', weight: 10 },
  tool_engagement:   { label: 'Tool engagement',     weight: 15 },
  consistent_intent: { label: 'Consistent intent',   weight: 10 },
  clean_ending:      { label: 'Clean ending',        weight: 10 },
}

/** Friendly model names */
function formatModel(model: string | null): string {
  if (!model) return '—'
  if (model.includes('opus')) return 'Opus'
  if (model.includes('sonnet')) return 'Sonnet'
  if (model.includes('haiku')) return 'Haiku'
  return model
}

/** Friendly end reason */
function formatEndReason(reason: string | null): string {
  if (!reason) return '—'
  const map: Record<string, string> = {
    natural: 'Completed naturally',
    user_quit: 'User quit',
    error: 'Error exit',
    timeout: 'Timed out',
  }
  return map[reason] ?? reason
}

/** Compress intent sequence into a flow visualization */
function formatIntentFlow(sequence: string | null): string[] {
  if (!sequence) return []
  try {
    const intents = JSON.parse(sequence) as string[]
    if (!Array.isArray(intents) || intents.length === 0) return []

    // Deduplicate consecutive same intents into "intent (Nx)"
    const segments: { intent: string; count: number }[] = []
    for (const intent of intents) {
      const last = segments[segments.length - 1]
      if (last && last.intent === intent) {
        last.count++
      } else {
        segments.push({ intent, count: 1 })
      }
    }

    return segments.map(s =>
      s.count > 1 ? `${s.intent} (${s.count}×)` : s.intent
    )
  } catch { return [] }
}

// ── Component ──

export function SessionDetail({ session, contributions, toolSummary, fieldCounts, onBack, onQuit }: Props) {
  const [mode, setMode] = useState<'summary' | 'raw'>('summary')
  const [rawIndex, setRawIndex] = useState(0)

  useInput((input, key) => {
    if (input === 'q') { onQuit(); return }
    if (key.escape) { onBack(); return }
    if (input === 'r') {
      setMode(m => m === 'summary' ? 'raw' : 'summary')
      return
    }
    if (mode === 'raw') {
      if (key.rightArrow) setRawIndex(i => Math.min(contributions.length - 1, i + 1))
      if (key.leftArrow) setRawIndex(i => Math.max(0, i - 1))
    }
  })

  const date = formatDate(session.started_at)
  const duration = formatDuration(session.started_at, session.ended_at)
  const headerWidth = 60

  // ── Header box ──

  const headerTitle = mode === 'summary'
    ? `Session · ${date} · ${duration}`
    : `Session · ${date} · Raw Contribution Data`

  const headerLine2 = mode === 'summary'
    ? `Subject: ${session.subject ?? 'Untitled'}`
    : `Showing contribution ${rawIndex + 1} of ${contributions.length}  ·  ←→ to cycle`

  const headerLine3 = mode === 'summary'
    ? `Score: ${session.satisfaction_score ?? '—'}/100  ·  Outcome: ${session.outcome ?? '—'}`
    : null

  const pad = (s: string) => s + ' '.repeat(Math.max(0, headerWidth - s.length - 3))

  const header = (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={COPPER}>
        {BOX.tl}{BOX.h} {headerTitle} {BOX.h.repeat(Math.max(0, headerWidth - headerTitle.length - 4))}{BOX.tr}
      </Text>
      <Text>
        <Text color={COPPER}>{BOX.v}</Text>
        <Text>  {pad(headerLine2)}</Text>
        <Text color={COPPER}>{BOX.v}</Text>
      </Text>
      {headerLine3 && (
        <Text>
          <Text color={COPPER}>{BOX.v}</Text>
          <Text>  {pad(headerLine3)}</Text>
          <Text color={COPPER}>{BOX.v}</Text>
        </Text>
      )}
      <Text color={COPPER}>
        {BOX.bl}{BOX.h.repeat(headerWidth - 1)}{BOX.br}
      </Text>
    </Box>
  )

  // ── Raw mode ──

  if (mode === 'raw') {
    const contrib = contributions[rawIndex] ?? {}
    const fields = Object.entries(contrib)

    return (
      <Box flexDirection="column">
        {header}
        <Box flexDirection="column" paddingLeft={2}>
          {fields.map(([key, val]) => (
            <Text key={key}>
              <Text color={COPPER}>{syncIndicator(key)}</Text>
              <Text color={MUTED}> {key.padEnd(20)}</Text>
              <Text>{tryParseJson(val)}</Text>
            </Text>
          ))}
        </Box>
        <Box paddingLeft={2} marginTop={1}>
          <Text color={TEXT_DIM}>r summary  ←→ prev/next contribution  esc back  q quit</Text>
        </Box>
      </Box>
    )
  }

  // ── Summary mode ──

  const languages = tryParseJson(session.languages_used)
  const toolsChain = tryParseJson(session.unique_tools)
  const mcpServers = tryParseJson(session.mcp_servers_used)
  const totalToolCalls = toolSummary.reduce((sum, t) => sum + t.count, 0)

  // Parse satisfaction signals
  let signals: Record<string, boolean> = {}
  if (session.satisfaction_signals) {
    try { signals = JSON.parse(session.satisfaction_signals) } catch { /* skip */ }
  }
  const hasSignals = Object.keys(signals).length > 0

  // Intent flow
  const intentFlow = formatIntentFlow(session.intent_sequence)

  // v4 metrics
  const editCount = session.edit_count ?? 0
  const readCount = session.read_count ?? 0
  const mcpToolCount = session.mcp_tool_count ?? 0
  const uniqueMcpServers = session.unique_mcp_servers ?? 0
  const subagentCount = session.subagent_count ?? 0
  const contextCompactions = session.context_compactions ?? 0

  const renderFieldSection = (label: string, counts: FieldCountRow[] | undefined) => {
    if (!counts || counts.length === 0) return null
    const display = counts.slice(0, 5).map(c => `${c.value} (${c.count}×)`).join(', ')
    return (
      <Text>
        <Text color={COPPER}>{syncIndicator(label)}</Text>
        <Text color={MUTED}> {label.padEnd(13)}</Text>
        <Text>{display}</Text>
      </Text>
    )
  }

  return (
    <Box flexDirection="column">
      {header}

      {/* Session Profile — model, duration, end reason, response stats */}
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>SESSION PROFILE</Text>
        <Text color={TEXT_DIM}>───────────────</Text>
        <Text>
          <Text color={MUTED}>  {'Model'.padEnd(16)}</Text>
          <Text>{formatModel(session.model)}</Text>
        </Text>
        <Text>
          <Text color={MUTED}>  {'Duration'.padEnd(16)}</Text>
          <Text>{duration}</Text>
          {session.duration_bucket && <Text color={TEXT_DIM}> ({session.duration_bucket})</Text>}
        </Text>
        <Text>
          <Text color={MUTED}>  {'Ended'.padEnd(16)}</Text>
          <Text>{formatEndReason(session.end_reason)}</Text>
        </Text>
        {session.permission_mode && (
          <Text>
            <Text color={MUTED}>  {'Permission'.padEnd(16)}</Text>
            <Text>{session.permission_mode}</Text>
          </Text>
        )}
        <Text>
          <Text color={MUTED}>  {'Responses'.padEnd(16)}</Text>
          <Text>{session.response_count} responses</Text>
          {session.avg_response_length > 0 && (
            <Text color={TEXT_DIM}> · avg {session.avg_response_length.toLocaleString()} chars</Text>
          )}
        </Text>
      </Box>

      {/* Satisfaction Signals — which signals fired and their weights */}
      {hasSignals && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text bold color={MUTED}>
            SATISFACTION SCORE
            <Text color={session.satisfaction_score != null && session.satisfaction_score >= 80 ? GOLD : COPPER}>
              {' '}{session.satisfaction_score ?? '—'}/100
            </Text>
          </Text>
          <Text color={TEXT_DIM}>──────────────────</Text>
          {Object.entries(SIGNAL_LABELS).map(([key, { label, weight }]) => {
            const fired = signals[key] ?? false
            return (
              <Text key={key}>
                <Text color={fired ? SUCCESS : TEXT_DIM}>{fired ? '  ✓' : '  ✗'}</Text>
                <Text color={fired ? undefined : TEXT_DIM}> {label.padEnd(22)}</Text>
                <Text color={fired ? COPPER : TEXT_DIM}>+{weight}</Text>
              </Text>
            )
          })}
        </Box>
      )}

      {/* Session Flow — how intent evolved over time */}
      {intentFlow.length > 1 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text bold color={MUTED}>SESSION FLOW</Text>
          <Text color={TEXT_DIM}>────────────</Text>
          <Text>
            <Text color={MUTED}>  </Text>
            {intentFlow.map((segment, i) => (
              <Text key={i}>
                {i > 0 && <Text color={TEXT_DIM}> → </Text>}
                <Text color={COPPER}>{segment}</Text>
              </Text>
            ))}
          </Text>
        </Box>
      )}

      {/* What Was Captured — languages, tools, MCP, edit/read stats */}
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>WHAT WAS CAPTURED</Text>
        <Text color={TEXT_DIM}>──────────────────</Text>
        <Text>
          <Text color={COPPER}>{syncIndicator('languages_used')}</Text>
          <Text color={MUTED}> {'Languages'.padEnd(16)}</Text>
          <Text>{languages || '—'}</Text>
        </Text>
        <Text>
          <Text color={COPPER}>{syncIndicator('unique_tools')}</Text>
          <Text color={MUTED}> {'Tools'.padEnd(16)}</Text>
          <Text>{toolsChain || '—'}</Text>
        </Text>
        {mcpServers && mcpServers !== '—' && (
          <Text>
            <Text color={COPPER}>{syncIndicator('mcp_servers_used')}</Text>
            <Text color={MUTED}> {'MCP servers'.padEnd(16)}</Text>
            <Text>{mcpServers}</Text>
          </Text>
        )}
        {(editCount > 0 || readCount > 0) && (
          <Text>
            <Text color={COPPER}>{syncIndicator('edit_count')}</Text>
            <Text color={MUTED}> {'Edit/Read'.padEnd(16)}</Text>
            <Text>
              {editCount} edits · {readCount} reads
              {session.search_to_edit_ratio != null ? ` · ${session.search_to_edit_ratio} ratio` : ''}
            </Text>
          </Text>
        )}
        {mcpToolCount > 0 && (
          <Text>
            <Text color={COPPER}>{syncIndicator('mcp_tool_count')}</Text>
            <Text color={MUTED}> {'MCP calls'.padEnd(16)}</Text>
            <Text>{mcpToolCount} calls · {uniqueMcpServers} servers</Text>
          </Text>
        )}
        {(subagentCount > 0 || contextCompactions > 0) && (
          <Text>
            <Text color={COPPER}>{syncIndicator('subagent_count')}</Text>
            <Text color={MUTED}> {'Complexity'.padEnd(16)}</Text>
            <Text>
              {subagentCount > 0 ? `${subagentCount} subagents` : ''}
              {subagentCount > 0 && contextCompactions > 0 ? ' · ' : ''}
              {contextCompactions > 0 ? `${contextCompactions} compactions` : ''}
            </Text>
          </Text>
        )}
        {session.error_recovery_rate != null && (
          <Text>
            <Text color={COPPER}>{syncIndicator('error_recovery_rate')}</Text>
            <Text color={MUTED}> {'Error recovery'.padEnd(16)}</Text>
            <Text>{Math.round(session.error_recovery_rate * 100)}%</Text>
          </Text>
        )}
      </Box>

      {/* Classification — merged: intent, complexity, domain, topics, actions */}
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>CLASSIFICATION</Text>
        <Text color={TEXT_DIM}>──────────────</Text>
        {renderFieldSection('Intent', fieldCounts.intent)}
        {renderFieldSection('Complexity', fieldCounts.complexity)}
        {renderFieldSection('Domain', fieldCounts.domain)}
        {renderFieldSection('Topics', fieldCounts.topic)}
        {renderFieldSection('Actions', fieldCounts.action)}
        {renderFieldSection('Style', fieldCounts.prompt_style)}
      </Box>

      {/* Tool Usage */}
      {toolSummary.length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text bold color={MUTED}>{`TOOL USAGE (${totalToolCalls} calls)`}</Text>
          <Text color={TEXT_DIM}>─────────────────────</Text>
          {toolSummary.map(t => {
            const pct = t.count > 0 ? Math.round((t.success_count / t.count) * 100) : 0
            return (
              <Text key={t.tool_name}>
                <Text color={COPPER}>{syncIndicator(t.tool_name)}</Text>
                <Text color={MUTED}> {t.tool_name.padEnd(13)}</Text>
                <Text>{`${t.count} calls  (${pct}% ok)`}</Text>
              </Text>
            )
          })}
        </Box>
      )}

      <Box paddingLeft={2} marginTop={1}>
        <Text color={TEXT_DIM}>r raw view  esc back  q quit</Text>
      </Box>
    </Box>
  )
}
