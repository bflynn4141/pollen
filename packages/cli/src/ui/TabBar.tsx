import React from 'react'
import { Box, Text } from 'ink'
import { ACTIVE_TAB, INACTIVE_TAB } from './theme.js'

export type TabId = 1 | 2 | 3 | 4

interface Props {
  activeTab: TabId
  onSwitch: (tab: TabId) => void
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 1, label: 'Mission Control' },
  { id: 2, label: 'Sessions' },
  { id: 3, label: 'Network' },
  { id: 4, label: 'Token' },
]

export function TabBar({ activeTab }: Props) {
  return (
    <Box paddingLeft={2} marginBottom={1}>
      {TABS.map((tab, i) => {
        const active = tab.id === activeTab
        return (
          <Text key={tab.id}>
            {i > 0 ? <Text color={INACTIVE_TAB}>   </Text> : null}
            <Text
              color={active ? ACTIVE_TAB : INACTIVE_TAB}
              bold={active}
              underline={active}
            >
              [{tab.id}] {tab.label}
            </Text>
          </Text>
        )
      })}
    </Box>
  )
}
