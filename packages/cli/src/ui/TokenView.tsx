import React from 'react'
import { Box, Text } from 'ink'
import { COPPER, GOLD, MUTED, TEXT_DIM, BOX } from './theme.js'
import type { ChainData } from './useChainData.js'

interface Props {
  chainData: ChainData
}

export function TokenView({ chainData }: Props) {
  const { loading, contractDeployed, walletAddress } = chainData

  if (loading) {
    return (
      <Box paddingLeft={2}>
        <Text color={MUTED}>Loading on-chain data...</Text>
      </Box>
    )
  }

  const truncAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : '—'

  if (!contractDeployed) {
    return (
      <Box flexDirection="column" paddingLeft={2}>
        <Text bold color={MUTED}>POLLEN TOKEN</Text>
        <Text color={TEXT_DIM}>────────────</Text>
        <Text color={GOLD}>Token contract not deployed yet.</Text>
        <Text color={TEXT_DIM}>Set POLLEN_TOKEN_ADDRESS to view on-chain balance.</Text>
        <Text />
        <Text><Text color={MUTED}>{'Wallet:'.padEnd(18)}</Text>{truncAddr}</Text>
        <Text><Text color={MUTED}>{'Current Epoch:'.padEnd(18)}</Text>{chainData.epoch}</Text>
        <Text><Text color={MUTED}>{'Epoch Pool:'.padEnd(18)}</Text>{chainData.epochPool.toLocaleString()} POLLEN</Text>
      </Box>
    )
  }

  const width = 54
  const balTitle = ' POLLEN Balance '

  return (
    <Box flexDirection="column" paddingLeft={2}>
      {/* Balance hero */}
      <Text color={COPPER}>
        {BOX.tl}{BOX.h}{balTitle}{BOX.h.repeat(Math.max(0, width - balTitle.length - 3))}{BOX.tr}
      </Text>
      <Text>
        <Text color={COPPER}>{BOX.v}</Text>
        <Text>  </Text>
        <Text color={GOLD} bold>{chainData.pollenBalance.toLocaleString()}</Text>
        <Text color={MUTED}> POLLEN</Text>
        <Text>{' '.repeat(Math.max(0, width - chainData.pollenBalance.toLocaleString().length - 10))}</Text>
        <Text color={COPPER}>{BOX.v}</Text>
      </Text>
      <Text color={COPPER}>
        {BOX.bl}{BOX.h.repeat(width - 1)}{BOX.br}
      </Text>

      <Text />

      {/* Details */}
      <Text><Text color={MUTED}>{'Wallet:'.padEnd(18)}</Text>{truncAddr}</Text>
      <Text><Text color={MUTED}>{'Share:'.padEnd(18)}</Text>{chainData.sharePercent.toFixed(2)}% of {chainData.totalSupply.toLocaleString()} supply</Text>
      <Text><Text color={MUTED}>{'Pending USDC:'.padEnd(18)}</Text><Text color={GOLD}>${chainData.pendingUsdc.toFixed(2)}</Text></Text>
      <Text><Text color={MUTED}>{'Holding since:'.padEnd(18)}</Text>block {chainData.holdingSinceBlock}</Text>

      <Text />

      {/* Epoch info */}
      <Text bold color={MUTED}>EPOCH</Text>
      <Text color={TEXT_DIM}>─────</Text>
      <Text><Text color={MUTED}>{'Current Epoch:'.padEnd(18)}</Text>{chainData.epoch}</Text>
      <Text><Text color={MUTED}>{'Pool Size:'.padEnd(18)}</Text>{chainData.epochPool.toLocaleString()} POLLEN</Text>
      <Text><Text color={MUTED}>{'Halving:'.padEnd(18)}</Text>every 13 epochs (~quarterly)</Text>

      <Text />

      {/* Claim hint */}
      <Text color={TEXT_DIM}>To claim tokens: pollen claim</Text>
      <Text color={TEXT_DIM}>To claim USDC:   pollen claim --revenue</Text>
    </Box>
  )
}
