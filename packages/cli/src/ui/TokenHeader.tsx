import React from 'react'
import { Box, Text } from 'ink'
import { COPPER, GOLD, MUTED, BOX } from './theme.js'
import type { ChainData } from './useChainData.js'
import type { Stats, TodayStats } from '../store.js'

interface Props {
  chainData: ChainData
  stats: Stats
  todayStats: TodayStats
}

export function TokenHeader({ chainData, stats, todayStats }: Props) {
  const title = ' Pollen Mission Control '
  const width = 66

  // Line 1: on-chain data
  const balanceStr = chainData.loading
    ? '--'
    : chainData.contractDeployed
      ? chainData.pollenBalance.toLocaleString()
      : 'not deployed'

  const shareStr = chainData.loading
    ? ''
    : chainData.contractDeployed
      ? ` (${chainData.sharePercent.toFixed(2)}%)`
      : ''

  const usdcStr = chainData.loading
    ? '--'
    : `$${chainData.pendingUsdc.toFixed(2)}`

  const epochStr = chainData.loading ? '--' : `${chainData.epoch}`

  const line1 = `${balanceStr}${shareStr} POLLEN  ·  ${usdcStr} USDC pending  ·  Epoch ${epochStr}`

  // Line 2: activity stats
  const line2 = `${stats.uniqueSessions} sessions  ·  ${todayStats.promptsToday} prompts today  ·  ${todayStats.toolCallsToday} tool calls`

  const pad = (s: string) => s + ' '.repeat(Math.max(0, width - s.length - 3))

  return (
    <Box flexDirection="column" marginBottom={0}>
      <Text color={COPPER}>
        {BOX.tl}{BOX.h}{title}{BOX.h.repeat(Math.max(0, width - title.length - 3))}{BOX.tr}
      </Text>
      <Text>
        <Text color={COPPER}>{BOX.v}</Text>
        <Text>  </Text>
        <Text color={GOLD} bold>{balanceStr}{shareStr}</Text>
        <Text> POLLEN  ·  {usdcStr} USDC pending  ·  Epoch {epochStr}</Text>
        <Text>{' '.repeat(Math.max(0, width - line1.length - 3))}</Text>
        <Text color={COPPER}>{BOX.v}</Text>
      </Text>
      <Text>
        <Text color={COPPER}>{BOX.v}</Text>
        <Text>  {pad(line2)}</Text>
        <Text color={COPPER}>{BOX.v}</Text>
      </Text>
      <Text color={COPPER}>
        {BOX.bl}{BOX.h.repeat(width - 1)}{BOX.br}
      </Text>
    </Box>
  )
}
