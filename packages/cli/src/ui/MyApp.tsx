import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Box, Text, useApp, useInput, useStdout } from 'ink'
import { TokenHeader } from './TokenHeader.js'
import { TabBar, type TabId } from './TabBar.js'
import { MissionControl } from './MissionControl.js'
import { SessionList } from './SessionList.js'
import { SessionDetail } from './SessionDetail.js'
import { NetworkView } from './NetworkView.js'
import { TokenView } from './TokenView.js'
import { useChainData } from './useChainData.js'
import { MUTED, TEXT_DIM } from './theme.js'
import {
  getStats, getSession,
  querySessionSummariesFull,
  querySessionContributions,
  querySessionToolSummary,
  querySessionFieldCounts,
  queryTodayStats,
  queryActiveSession,
  queryCompletedSessions,
  queryTrends,
  queryMcpServerUsage,
  queryNetworkStats,
  queryNetworkTrends,
  queryNetworkActivityMix,
  queryNetworkDomainMix,
  queryNetworkPeakHours,
  queryTodayActivity,
  queryVibecoderDNA,
  queryAllContributorAggregates,
} from '../store.js'
import { getOrCreateContributorId } from '../config.js'
import type Database from 'better-sqlite3'

type View =
  | { screen: 'tabs' }
  | { screen: 'detail'; sessionId: string }

interface Props {
  db: Database.Database
}

export function MyApp({ db }: Props) {
  const { exit } = useApp()
  const [view, setView] = useState<View>({ screen: 'tabs' })
  const [activeTab, setActiveTab] = useState<TabId>(1)
  const [listIndex, setListIndex] = useState(0)
  const [tick, setTick] = useState(0)

  // Poll SQLite every 2s so new hook data appears live
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2000)
    return () => clearInterval(id)
  }, [])

  // Clear terminal when transitioning between views so stale lines don't linger
  const { stdout } = useStdout()
  const prevScreen = useRef(view.screen)
  useEffect(() => {
    if (prevScreen.current !== view.screen) {
      stdout.write('\x1B[2J\x1B[H')
      prevScreen.current = view.screen
    }
  }, [view.screen])

  // On-chain data (polls every 10s internally)
  const chainData = useChainData()

  // Contributor identity (stable across renders)
  const contributorId = useMemo(() => getOrCreateContributorId(), [])

  // Core queries (refresh on each tick)
  const stats = getStats(db)
  const todayStats = queryTodayStats(db)
  const sessions = querySessionSummariesFull(db, 100)

  // Mission Control data (personal)
  const activeSession = queryActiveSession(db)
  const completedSessions = queryCompletedSessions(db, 15)
  const todayActivity = queryTodayActivity(db)
  const trends = queryTrends(db, 7)

  // Vibecoder Profile data
  const vibecoderDNA = queryVibecoderDNA(db, contributorId)
  const allAggregates = queryAllContributorAggregates(db)

  // Network data (aggregate across all contributors)
  const networkStats = queryNetworkStats(db)
  const networkTrends = queryNetworkTrends(db, 7)
  const activityMix = queryNetworkActivityMix(db)
  const domainMix = queryNetworkDomainMix(db)
  const peakHours = queryNetworkPeakHours(db)
  const mcpServers = queryMcpServerUsage(db)

  // Tab switching input (active when not in detail view)
  const TAB_COUNT = 4
  useInput((input, key) => {
    if (input === 'q') { exit(); return }

    if (view.screen === 'tabs') {
      if (input === '1') setActiveTab(1)
      if (input === '2') setActiveTab(2)
      if (input === '3') setActiveTab(3)
      if (input === '4') setActiveTab(4)
      if (key.leftArrow) setActiveTab(t => (t === 1 ? TAB_COUNT : t - 1) as TabId)
      if (key.rightArrow) setActiveTab(t => (t === TAB_COUNT ? 1 : t + 1) as TabId)
    }
  }, { isActive: view.screen === 'tabs' })

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

  // ── Detail view (from Tab 2) ──

  if (view.screen === 'detail') {
    const session = getSession(db, view.sessionId)
    if (!session) {
      setView({ screen: 'tabs' })
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
        onBack={() => setView({ screen: 'tabs' })}
        onQuit={handleQuit}
      />
    )
  }

  // ── Tabbed views ──

  return (
    <Box flexDirection="column">
      <TabBar
        activeTab={activeTab}
        onSwitch={setActiveTab}
      />

      {activeTab === 1 && (
        <>
          <TokenHeader
            chainData={chainData}
            stats={stats}
            todayStats={todayStats}
          />
          <MissionControl
            activeSession={activeSession}
            completedSessions={completedSessions}
            todayActivity={todayActivity}
            trends={trends}
            vibecoderDNA={vibecoderDNA}
            allAggregates={allAggregates}
            contributorId={contributorId}
          />
        </>
      )}

      {activeTab === 2 && (
        <SessionList
          sessions={sessions}
          onSelect={(id) => {
            setListIndex(sessions.findIndex(s => s.session_id === id))
            setView({ screen: 'detail', sessionId: id })
          }}
          onQuit={handleQuit}
          initialIndex={listIndex}
        />
      )}

      {activeTab === 3 && (
        <NetworkView
          networkStats={networkStats}
          trends={networkTrends}
          activityMix={activityMix}
          domainMix={domainMix}
          peakHours={peakHours}
          mcpServers={mcpServers}
        />
      )}

      {activeTab === 4 && (
        <TokenView chainData={chainData} />
      )}

      {/* Footer */}
      <Box paddingLeft={2} marginTop={1}>
        <Text color={TEXT_DIM}>←→ or 1-4 tabs  {activeTab === 2 ? '↑↓ navigate  ⏎ detail  ' : ''}q quit</Text>
      </Box>
    </Box>
  )
}
