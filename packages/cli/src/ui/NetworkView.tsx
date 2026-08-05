import React from 'react'
import { Box, Text } from 'ink'
import { COPPER, GOLD, MUTED, TEXT_DIM } from './theme.js'
import { sparkline } from './sparkline.js'
import type {
  McpServerRow, NetworkStats,
  NetworkTrendRow, NetworkActivityRow, NetworkDomainRow,
  NetworkHourRow,
} from '../store.js'

interface Props {
  networkStats: NetworkStats
  trends: NetworkTrendRow[]
  activityMix: NetworkActivityRow[]
  domainMix: NetworkDomainRow[]
  peakHours: NetworkHourRow[]
  mcpServers: McpServerRow[]
}

/** Map (intent, domain) → human-readable activity label */
function formatActivity(intent: string, domain: string): string {
  const labels: Record<string, Record<string, string>> = {
    feature_build: {
      web_frontend: 'Build frontends',
      web_backend: 'Build APIs & services',
      data: 'Build data tools',
      devops: 'Build infra tooling',
      general: 'Build features',
      systems: 'Build system tools',
    },
    debugging: {
      web_frontend: 'Debug UI issues',
      web_backend: 'Debug backend bugs',
      data: 'Debug data pipelines',
      general: 'Debug & troubleshoot',
      systems: 'Debug system issues',
      devops: 'Debug deploys',
    },
    refactoring: {
      web_backend: 'Refactor backend',
      web_frontend: 'Refactor frontend',
      data: 'Refactor data layer',
    },
    devops: { devops: 'Deploy & CI/CD', general: 'Infra automation' },
    testing: { data: 'Test data logic', web_backend: 'Test APIs' },
    documentation: { web_backend: 'Document APIs' },
    code_review: { web_backend: 'Review backend PRs' },
    learning: { general: 'Learn new tech' },
    exploration: { general: 'Research & explore', systems: 'Investigate systems' },
  }
  const fallbacks: Record<string, string> = {
    feature_build: 'Build features',
    debugging: 'Debug & fix',
    refactoring: 'Refactor code',
    devops: 'DevOps & deploy',
    testing: 'Write tests',
    documentation: 'Write docs',
    code_review: 'Review code',
    learning: 'Learn & study',
    exploration: 'Research & explore',
  }
  return labels[intent]?.[domain] ?? fallbacks[intent] ?? intent
}

function pctBar(value: number, max: number, width = 20): { filled: string; empty: string } {
  const barLen = Math.max(0, Math.min(width, Math.round((value / max) * width)))
  return {
    filled: '\u2588'.repeat(barLen),
    empty: '\u2591'.repeat(width - barLen),
  }
}

const HOUR_LABELS: Record<string, string> = {
  morning:   'Morning   6a-12p',
  afternoon: 'Afternoon 12-5p ',
  evening:   'Evening   5-10p ',
  night:     'Night     10p-6a',
}

export function NetworkView({ networkStats, trends, activityMix, domainMix, peakHours, mcpServers }: Props) {
  const maxMcpCalls = mcpServers[0]?.call_count ?? 1

  // Sparkline data — just the 3 that tell a story
  const sessionCounts = trends.map(t => t.session_count)
  const promptsPerSession = trends.map(t => t.avg_prompts_per_session)
  const completionRates = trends.map(t => t.completion_rate)

  const sessionSpark = sparkline(sessionCounts)
  const depthSpark = sparkline(promptsPerSession)
  const completionSpark = sparkline(completionRates)

  const totalTrendSessions = sessionCounts.reduce((a, b) => a + b, 0)
  const avgDaily = sessionCounts.length > 0
    ? Math.round(totalTrendSessions / sessionCounts.length)
    : 0
  const avgDepth = promptsPerSession.length > 0
    ? (promptsPerSession.reduce((a, b) => a + b, 0) / promptsPerSession.length).toFixed(1)
    : '0'
  const avgCompletion = completionRates.length > 0
    ? Math.round(completionRates.reduce((a, b) => a + b, 0) / completionRates.length)
    : 0

  // Peak hours
  const totalHourPrompts = peakHours.reduce((s, r) => s + r.count, 0)
  const maxHourCount = Math.max(...peakHours.map(r => r.count), 1)
  const peakBucket = peakHours.length > 0
    ? peakHours.reduce((a, b) => b.count > a.count ? b : a).hour_bucket
    : null

  // Activity mix (intent + domain → descriptive label)
  const topActivities = activityMix.slice(0, 8)
  const maxActivity = topActivities[0]?.count ?? 1
  const totalActivities = activityMix.reduce((s, r) => s + r.count, 0)

  // Domain mix
  const topDomains = domainMix.slice(0, 6)
  const maxDomain = topDomains[0]?.count ?? 1
  const totalDomains = domainMix.reduce((s, r) => s + r.count, 0)

  return (
    <Box flexDirection="column">
      {/* Network Overview */}
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>NETWORK OVERVIEW</Text>
        <Text color={TEXT_DIM}>{'\u2500'.repeat(16)}</Text>
        <Text>
          <Text>  {'Contributors'.padEnd(18)}</Text>
          <Text color={COPPER} bold>{networkStats.totalContributors}</Text>
          <Text color={MUTED}> unique vibecoders</Text>
        </Text>
        <Text>
          <Text>  {'Sessions'.padEnd(18)}</Text>
          <Text color={COPPER} bold>{networkStats.totalSessions}</Text>
          <Text color={MUTED}> total</Text>
        </Text>
        <Text>
          <Text>  {'Avg satisfaction'.padEnd(18)}</Text>
          <Text color={networkStats.avgSatisfaction >= 80 ? GOLD : COPPER} bold>
            {networkStats.avgSatisfaction}{'\u2605'}
          </Text>
          <Text color={MUTED}> across all sessions</Text>
        </Text>
      </Box>

      {/* 7-Day Trends — spaced for readability */}
      {trends.length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text bold color={MUTED}>7-DAY TRENDS</Text>
          <Text color={TEXT_DIM}>{'\u2500'.repeat(12)}</Text>
          <Text> </Text>
          <Text>
            <Text>  {'Sessions/day'.padEnd(18)}</Text>
            <Text color={COPPER}>{sessionSpark}</Text>
            <Text color={MUTED}>  avg {avgDaily}/day</Text>
          </Text>
          <Text> </Text>
          <Text>
            <Text>  {'Session depth'.padEnd(18)}</Text>
            <Text color={COPPER}>{depthSpark}</Text>
            <Text color={MUTED}>  avg {avgDepth} prompts/session</Text>
          </Text>
          <Text> </Text>
          <Text>
            <Text>  {'Completion rate'.padEnd(18)}</Text>
            <Text color={avgCompletion >= 80 ? GOLD : COPPER}>{completionSpark}</Text>
            <Text color={MUTED}>  avg {avgCompletion}%</Text>
          </Text>
        </Box>
      )}

      {/* When Vibecoders Code — time-of-day distribution */}
      {peakHours.length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text bold color={MUTED}>WHEN VIBECODERS CODE</Text>
          <Text color={TEXT_DIM}>{'\u2500'.repeat(20)}</Text>
          {peakHours.map(row => {
            const label = HOUR_LABELS[row.hour_bucket] ?? row.hour_bucket
            const bar = pctBar(row.count, maxHourCount, 16)
            const pctVal = totalHourPrompts > 0 ? Math.round((row.count / totalHourPrompts) * 100) : 0
            const isPeak = row.hour_bucket === peakBucket
            return (
              <Text key={row.hour_bucket}>
                <Text>  {label.padEnd(18)}</Text>
                <Text color={isPeak ? GOLD : COPPER}>{bar.filled}</Text>
                <Text color={TEXT_DIM}>{bar.empty}</Text>
                <Text color={MUTED}>  {pctVal}%</Text>
                {isPeak && <Text color={GOLD}> {'\u2190'} peak</Text>}
              </Text>
            )
          })}
        </Box>
      )}

      {/* What Vibecoders Build — Activity Mix (intent × domain) */}
      {topActivities.length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text bold color={MUTED}>WHAT VIBECODERS BUILD</Text>
          <Text color={TEXT_DIM}>{'\u2500'.repeat(21)}</Text>
          {topActivities.map(row => {
            const label = formatActivity(row.intent, row.domain)
            const bar = pctBar(row.count, maxActivity)
            const pctVal = Math.round((row.count / totalActivities) * 100)
            return (
              <Text key={`${row.intent}-${row.domain}`}>
                <Text>  {label.padEnd(22)}</Text>
                <Text color={COPPER}>{bar.filled}</Text>
                <Text color={TEXT_DIM}>{bar.empty}</Text>
                <Text color={MUTED}>  {pctVal}%</Text>
              </Text>
            )
          })}
        </Box>
      )}

      {/* Domain Distribution */}
      {topDomains.length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text bold color={MUTED}>WHERE THEY WORK</Text>
          <Text color={TEXT_DIM}>{'\u2500'.repeat(15)}</Text>
          {topDomains.map(row => {
            const bar = pctBar(row.count, maxDomain)
            const pctVal = Math.round((row.count / totalDomains) * 100)
            return (
              <Text key={row.domain}>
                <Text>  {row.domain.padEnd(18)}</Text>
                <Text color={COPPER}>{bar.filled}</Text>
                <Text color={TEXT_DIM}>{bar.empty}</Text>
                <Text color={MUTED}>  {pctVal}%</Text>
              </Text>
            )
          })}
        </Box>
      )}

      {/* MCP Ecosystem */}
      {mcpServers.length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text bold color={MUTED}>MCP ECOSYSTEM</Text>
          <Text color={TEXT_DIM}>{'\u2500'.repeat(13)}</Text>
          {mcpServers.slice(0, 8).map(row => {
            const bar = pctBar(row.call_count, maxMcpCalls)
            const pct = row.call_count > 0
              ? Math.round((row.success_count / row.call_count) * 100)
              : 0
            return (
              <Text key={row.mcp_server}>
                <Text>  {row.mcp_server.padEnd(20)}</Text>
                <Text color={COPPER}>{bar.filled}</Text>
                <Text color={TEXT_DIM}>{bar.empty}</Text>
                <Text color={MUTED}>  {String(row.call_count).padStart(3)} calls  ({pct}% ok)</Text>
              </Text>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
