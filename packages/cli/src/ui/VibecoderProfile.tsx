import React from 'react'
import { Box, Text } from 'ink'
import { COPPER, GOLD, MUTED, TEXT_DIM } from './theme.js'
import type { VibecoderDNARow, ContributorAggregateRow } from '../store.js'

interface Props {
  vibecoderDNA: VibecoderDNARow[]
  allAggregates: ContributorAggregateRow[]
  contributorId: string
}

// ── Archetype mapping (9 intents → 5 types) ──

const ARCHETYPE_MAP: Record<string, string> = {
  feature_build: 'Builder',
  debugging: 'Debugger',
  refactoring: 'Architect',
  code_review: 'Architect',
  exploration: 'Explorer',
  learning: 'Explorer',
  devops: 'Operator',
  testing: 'Operator',
  documentation: 'Operator',
}

interface ArchetypeEntry {
  label: string
  count: number
  pct: number
}

function groupByArchetype(dnaRows: VibecoderDNARow[]): ArchetypeEntry[] {
  const totals = new Map<string, number>()
  for (const row of dnaRows) {
    const archetype = ARCHETYPE_MAP[row.dominant_intent] ?? row.dominant_intent
    totals.set(archetype, (totals.get(archetype) ?? 0) + row.count)
  }
  const total = dnaRows.reduce((s, r) => s + r.count, 0)
  return Array.from(totals.entries())
    .map(([label, count]) => ({ label, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
}

// ── Percentile computation ──

interface PercentileResult {
  label: string
  topPct: number
  rawValue: string
  key: string
}

type AggregateKey = 'avg_prompts' | 'avg_tools' | 'max_mcp_servers' | 'avg_satisfaction' | 'session_count'

const DIMENSIONS: { key: AggregateKey; label: string; format: (v: number) => string }[] = [
  { key: 'avg_prompts', label: 'Session depth', format: v => `avg ${v} prompts` },
  { key: 'avg_tools', label: 'Tool mastery', format: v => `avg ${v} tools` },
  { key: 'max_mcp_servers', label: 'MCP breadth', format: v => `${v} servers` },
  { key: 'avg_satisfaction', label: 'Satisfaction', format: v => `${v}\u2605` },
  { key: 'session_count', label: 'Volume', format: v => `${v} sessions` },
]

function computePercentiles(
  contributorId: string,
  aggregates: ContributorAggregateRow[],
): PercentileResult[] {
  const me = aggregates.find(a => a.contributor_id === contributorId)
  if (!me) return []

  const n = aggregates.length
  return DIMENSIONS.map(dim => {
    const myVal = (me[dim.key] as number) ?? 0
    const below = aggregates.filter(a => ((a[dim.key] as number) ?? 0) < myVal).length
    const percentile = n <= 1 ? 50 : Math.round((below / (n - 1)) * 100)
    const topPct = 100 - percentile
    return {
      label: dim.label,
      topPct,
      rawValue: dim.format(myVal),
      key: dim.key,
    }
  })
}

// ── Standout computation ──

function computeStandout(
  contributorId: string,
  aggregates: ContributorAggregateRow[],
): string | null {
  const me = aggregates.find(a => a.contributor_id === contributorId)
  if (!me || aggregates.length < 2) return null

  let bestRatio = 0
  let bestLabel = ''
  let bestAbove = 0

  for (const dim of DIMENSIONS) {
    const myVal = (me[dim.key] as number) ?? 0
    const others = aggregates.filter(a => a.contributor_id !== contributorId)
    const avg = others.reduce((s, a) => s + ((a[dim.key] as number) ?? 0), 0) / others.length
    if (avg <= 0) continue
    const ratio = myVal / avg
    if (ratio > bestRatio) {
      bestRatio = ratio
      bestLabel = dim.label
      bestAbove = aggregates.filter(a =>
        a.contributor_id !== contributorId && ((a[dim.key] as number) ?? 0) > myVal
      ).length
    }
  }

  if (bestRatio <= 1) return null
  const higher = bestAbove
  const ratioStr = bestRatio.toFixed(1)
  if (higher === 0) {
    return `Your ${bestLabel} is ${ratioStr}\u00d7 the network avg \u2014 you lead the network`
  }
  return `Your ${bestLabel} is ${ratioStr}\u00d7 the network avg \u2014 only ${higher} vibecoder${higher === 1 ? '' : 's'} rank${higher === 1 ? 's' : ''} higher`
}

// ── Bar renderer ──

function pctBar(value: number, max: number, width = 20): { filled: string; empty: string } {
  const barLen = Math.max(0, Math.min(width, Math.round((value / max) * width)))
  return {
    filled: '\u2588'.repeat(barLen),
    empty: '\u2591'.repeat(width - barLen),
  }
}

// ── Component ──

export function VibecoderProfile({ vibecoderDNA, allAggregates, contributorId }: Props) {
  const hasSessions = vibecoderDNA.length > 0
  const me = allAggregates.find(a => a.contributor_id === contributorId)

  if (!hasSessions || !me) {
    return (
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>YOUR VIBECODER DNA</Text>
        <Text color={TEXT_DIM}>{'\u2500'.repeat(18)}</Text>
        <Text color={TEXT_DIM}>  Start a session to build your profile.</Text>
      </Box>
    )
  }

  const archetypes = groupByArchetype(vibecoderDNA)
  const percentiles = computePercentiles(contributorId, allAggregates)
  const standout = computeStandout(contributorId, allAggregates)
  const n = allAggregates.length
  const soloMode = n <= 1

  return (
    <Box flexDirection="column">
      {/* DNA Section */}
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>YOUR VIBECODER DNA</Text>
        <Text color={TEXT_DIM}>{'\u2500'.repeat(18)}</Text>
        {archetypes.map(a => {
          const bar = pctBar(a.pct, 100)
          return (
            <Text key={a.label}>
              <Text>  {a.label.padEnd(13)}</Text>
              <Text color={COPPER}>{bar.filled}</Text>
              <Text color={TEXT_DIM}>{bar.empty}</Text>
              <Text color={MUTED}>  {a.pct}%</Text>
            </Text>
          )
        })}
      </Box>

      {/* Standout callout */}
      {standout && (
        <Box paddingLeft={2} marginBottom={1}>
          <Text color={GOLD}>{'\u2605'} {standout}</Text>
        </Box>
      )}

      {/* Percentiles Section */}
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>HOW YOU COMPARE  <Text color={TEXT_DIM}>({n} vibecoder{n === 1 ? '' : 's'})</Text></Text>
        <Text color={TEXT_DIM}>{'\u2500'.repeat(16)}</Text>
        {percentiles.map(p => {
          const fillPct = 100 - p.topPct // top 8% = 92% filled
          const bar = pctBar(fillPct, 100)
          const isTop = p.topPct <= 20
          const rankLabel = soloMode ? "you're the first!" : `top ${p.topPct}%`
          return (
            <Text key={p.key}>
              <Text>  {p.label.padEnd(18)}</Text>
              <Text color={isTop ? GOLD : COPPER}>{bar.filled}</Text>
              <Text color={TEXT_DIM}>{bar.empty}</Text>
              <Text color={isTop ? GOLD : MUTED}>  {rankLabel.padEnd(10)}</Text>
              <Text color={MUTED}>{p.rawValue}</Text>
            </Text>
          )
        })}
      </Box>
    </Box>
  )
}
