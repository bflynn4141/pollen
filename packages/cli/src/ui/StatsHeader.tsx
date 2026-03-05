import React from 'react'
import { Box, Text } from 'ink'
import { COPPER, BOX } from './theme.js'

interface Props {
  sessions: number
  prompts: number
  toolCalls: number
}

export function StatsHeader({ sessions, prompts, toolCalls }: Props) {
  const title = ' My Pollen Data '
  const stats = `${sessions} sessions  ·  ${prompts.toLocaleString()} prompts  ·  ${toolCalls.toLocaleString()} tool calls`
  const width = Math.max(stats.length + 4, 60)

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={COPPER}>
        {BOX.tl}{BOX.h}{title}{BOX.h.repeat(width - title.length - 3)}{BOX.tr}
      </Text>
      <Text>
        <Text color={COPPER}>{BOX.v}</Text>
        <Text>  {stats}{' '.repeat(Math.max(0, width - stats.length - 3))}</Text>
        <Text color={COPPER}>{BOX.v}</Text>
      </Text>
      <Text color={COPPER}>
        {BOX.bl}{BOX.h.repeat(width - 1)}{BOX.br}
      </Text>
    </Box>
  )
}
