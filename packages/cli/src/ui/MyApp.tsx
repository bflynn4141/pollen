import React, { useState, useEffect } from 'react'
import { Box, Text, useApp } from 'ink'
import { StatsHeader } from './StatsHeader.js'
import { SessionList } from './SessionList.js'
import { SessionDetail } from './SessionDetail.js'
import { MUTED } from './theme.js'
import {
  getStats, getSession,
  querySessionSummariesFull,
  querySessionContributions,
  querySessionToolSummary,
  querySessionFieldCounts,
} from '../store.js'
import type Database from 'better-sqlite3'

type View =
  | { screen: 'list' }
  | { screen: 'detail'; sessionId: string }

interface Props {
  db: Database.Database
}

export function MyApp({ db }: Props) {
  const { exit } = useApp()
  const [view, setView] = useState<View>({ screen: 'list' })
  const [listIndex, setListIndex] = useState(0)
  const [tick, setTick] = useState(0)

  // Poll SQLite every 2s so new hook data appears live
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  const stats = getStats(db)
  const sessions = querySessionSummariesFull(db, 100)
  const totalTools = sessions.reduce((sum, s) => sum + s.tool_use_count, 0)

  const handleQuit = () => exit()

  if (stats.total === 0 && sessions.length === 0) {
    return (
      <Box paddingLeft={1}>
        <Text color={MUTED}>
          No pollen data yet. Use Claude Code with the hook active to start collecting.
        </Text>
      </Box>
    )
  }

  // ── Detail view ──

  if (view.screen === 'detail') {
    const session = getSession(db, view.sessionId)
    if (!session) {
      setView({ screen: 'list' })
      return null
    }

    const contributions = querySessionContributions(db, view.sessionId)
    const toolSummary = querySessionToolSummary(db, view.sessionId)

    const fieldNames = ['intent', 'complexity', 'prompt_style', 'domain', 'action', 'topic'] as const
    const fieldCounts: Record<string, { value: string; count: number }[]> = {}
    for (const f of fieldNames) {
      fieldCounts[f] = querySessionFieldCounts(db, view.sessionId, f)
    }

    return (
      <SessionDetail
        session={session}
        contributions={contributions}
        toolSummary={toolSummary}
        fieldCounts={fieldCounts}
        onBack={() => setView({ screen: 'list' })}
        onQuit={handleQuit}
      />
    )
  }

  // ── List view ──

  return (
    <Box flexDirection="column">
      <StatsHeader
        sessions={stats.uniqueSessions}
        prompts={stats.total}
        toolCalls={totalTools}
      />
      <SessionList
        sessions={sessions}
        onSelect={(id) => {
          setView({ screen: 'detail', sessionId: id })
        }}
        onQuit={handleQuit}
        initialIndex={listIndex}
      />
    </Box>
  )
}
