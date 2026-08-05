import React from 'react'
import { Box, Text } from 'ink'
import { COPPER, GOLD, MUTED, TEXT_DIM } from './theme.js'
import { sparkline } from './sparkline.js'
import { VibecoderProfile } from './VibecoderProfile.js'
import type {
  ActiveSessionRow, CompletedSessionRow,
  TodayActivityRow, TrendRow,
  VibecoderDNARow, ContributorAggregateRow,
} from '../store.js'

interface Props {
  activeSession: ActiveSessionRow | null
  completedSessions: CompletedSessionRow[]
  todayActivity: TodayActivityRow[]
  trends: TrendRow[]
  vibecoderDNA: VibecoderDNARow[]
  allAggregates: ContributorAggregateRow[]
  contributorId: string
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

function formatDuration(startMs: number): string {
  const mins = Math.round((Date.now() - startMs) / 60000)
  if (mins < 1) return '<1min'
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function sessionSubject(s: { subject: string | null; dominant_intent: string | null }): string {
  if (s.subject && s.subject.length < 80 && !s.subject.startsWith('I ')) {
    return s.subject
  }
  return s.dominant_intent ?? 'Active session'
}

/** Capitalize first letter */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function MissionControl({ activeSession, completedSessions, todayActivity, trends, vibecoderDNA, allAggregates, contributorId }: Props) {
  // ── 7-Day Sparkline ──
  const trendValues = trends.map(t => t.count)
  const spark = sparkline(trendValues)
  const avg = trendValues.length > 0
    ? Math.round(trendValues.reduce((a, b) => a + b, 0) / trendValues.length)
    : 0

  return (
    <Box flexDirection="column">
      {/* Active Session Hero */}
      {activeSession && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text>
            <Text color={GOLD} bold>{'►'}</Text>
            <Text color={MUTED}> NOW  </Text>
            <Text bold>{sessionSubject(activeSession)}</Text>
          </Text>
          <Text>
            <Text color={MUTED}>{'      '}</Text>
            <Text color={COPPER}>{activeSession.prompt_count}</Text>
            <Text color={MUTED}> prompts  ·  </Text>
            <Text color={COPPER}>{activeSession.tool_use_count}</Text>
            <Text color={MUTED}> tools  ·  {formatDuration(activeSession.started_at)}</Text>
          </Text>
          <Text color={TEXT_DIM}>  {'─'.repeat(56)}</Text>
        </Box>
      )}

      {/* Today's Activity — what data was contributed today */}
      {todayActivity.length > 0 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text bold color={MUTED}>TODAY'S ACTIVITY</Text>
          <Text color={TEXT_DIM}>────────────────</Text>
          {todayActivity.map(row => (
            <Text key={`${row.action}-${row.topic}`}>
              <Text color={MUTED}>  ·  </Text>
              <Text>{cap(row.action)}</Text>
              <Text color={MUTED}> → </Text>
              <Text color={COPPER}>{row.topic}</Text>
              {row.count > 1 && <Text color={TEXT_DIM}> ({row.count}×)</Text>}
            </Text>
          ))}
        </Box>
      )}

      {todayActivity.length === 0 && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          <Text bold color={MUTED}>TODAY'S ACTIVITY</Text>
          <Text color={TEXT_DIM}>────────────────</Text>
          <Text color={TEXT_DIM}>  No data captured today yet. Start a Claude Code session to begin.</Text>
        </Box>
      )}

      {/* Vibecoder Profile */}
      <VibecoderProfile
        vibecoderDNA={vibecoderDNA}
        allAggregates={allAggregates}
        contributorId={contributorId}
      />

      {/* Completed Sessions Feed */}
      <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
        <Text bold color={MUTED}>RECENT SESSIONS</Text>
        <Text color={TEXT_DIM}>───────────────</Text>
        {completedSessions.length === 0 ? (
          <Text color={TEXT_DIM}>  No completed sessions yet.</Text>
        ) : (
          completedSessions.slice(0, 5).map((s) => {
            const time = formatTime(s.started_at)
            const subject = sessionSubject(s)
            const score = s.satisfaction_score != null
              ? `${s.satisfaction_score}★`
              : ''
            return (
              <Text key={s.session_id}>
                <Text color={MUTED}>  {time}</Text>
                <Text>  {subject.substring(0, 42).padEnd(42)}</Text>
                <Text color={MUTED}>{String(s.prompt_count).padStart(3)}p</Text>
                <Text color={score && s.satisfaction_score! >= 80 ? GOLD : MUTED}>  {score.padStart(4)}</Text>
              </Text>
            )
          })
        )}
      </Box>

      {/* 7-Day Sparkline */}
      {trendValues.length > 0 && (
        <Box paddingLeft={2}>
          <Text color={MUTED}>7d activity: </Text>
          <Text color={COPPER}>{spark}</Text>
          <Text color={MUTED}>  (avg {avg}/day)</Text>
        </Box>
      )}
    </Box>
  )
}
