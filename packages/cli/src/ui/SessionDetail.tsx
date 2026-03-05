import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { COPPER, MUTED, TEXT_DIM, syncIndicator, BOX } from './theme.js'
import type { SessionToolSummaryRow, FieldCountRow } from '../store.js'

interface SessionInfo {
  session_id: string
  started_at: number
  ended_at: number | null
  subject: string | null
  satisfaction_score: number | null
  outcome: string | null
  languages_used: string | null
  unique_tools: string | null
  mcp_servers_used: string | null
  dominant_intent: string | null
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

      {/* What Was Detected */}
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>WHAT WAS DETECTED                           ☁ = synced  ⊙ = local</Text>
        <Text color={TEXT_DIM}>─────────────────</Text>
        <Text>
          <Text color={COPPER}>{syncIndicator('languages_used')}</Text>
          <Text color={MUTED}> {'Languages'.padEnd(13)}</Text>
          <Text>{languages || '—'}</Text>
        </Text>
        <Text>
          <Text color={COPPER}>{syncIndicator('unique_tools')}</Text>
          <Text color={MUTED}> {'Tools chain'.padEnd(13)}</Text>
          <Text>{toolsChain || '—'}</Text>
        </Text>
        {mcpServers && mcpServers !== '—' && (
          <Text>
            <Text color={COPPER}>{syncIndicator('mcp_servers_used')}</Text>
            <Text color={MUTED}> {'MCP servers'.padEnd(13)}</Text>
            <Text>{mcpServers}</Text>
          </Text>
        )}
      </Box>

      {/* How You Prompted */}
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>HOW YOU PROMPTED</Text>
        <Text color={TEXT_DIM}>────────────────</Text>
        {renderFieldSection('Intent', fieldCounts.intent)}
        {renderFieldSection('Complexity', fieldCounts.complexity)}
        {renderFieldSection('Prompt style', fieldCounts.prompt_style)}
      </Box>

      {/* What You Worked On */}
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>WHAT YOU WORKED ON</Text>
        <Text color={TEXT_DIM}>──────────────────</Text>
        {renderFieldSection('Domain', fieldCounts.domain)}
        {renderFieldSection('Topics', fieldCounts.topic)}
        {renderFieldSection('Actions', fieldCounts.action)}
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
        <Text color={TEXT_DIM}>r raw view  esc back  ↑↓ scroll  q quit</Text>
      </Box>
    </Box>
  )
}
