import { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { COPPER, MUTED, TEXT_DIM } from './theme.js'
import type { SessionSummaryFullRow } from '../store.js'

interface Props {
  sessions: SessionSummaryFullRow[]
  onSelect: (sessionId: string) => void
  onQuit: () => void
  initialIndex?: number
}

const PAGE_SIZE = 15

function formatDate(ts: number): string {
  const d = new Date(ts)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const day = d.getDate()
  const hh = d.getHours().toString().padStart(2, '0')
  const mm = d.getMinutes().toString().padStart(2, '0')
  return `${months[d.getMonth()]} ${day} ${hh}:${mm}`
}

function formatDuration(start: number, end: number | null): string {
  if (!end) return '...'
  const mins = Math.round((end - start) / 60000)
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function SessionList({ sessions, onSelect, onQuit, initialIndex = 0 }: Props) {
  const [cursor, setCursor] = useState(initialIndex)

  useInput((input, key) => {
    if (input === 'q') { onQuit(); return }
    if (key.upArrow || input === 'k') {
      setCursor(c => Math.max(0, c - 1))
    }
    if (key.downArrow || input === 'j') {
      setCursor(c => Math.min(sessions.length - 1, c + 1))
    }
    if (key.return) {
      if (sessions[cursor]) onSelect(sessions[cursor].session_id)
    }
  })

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text color={MUTED}>
          No sessions yet. Use Claude Code with the pollen hook to start collecting data.
        </Text>
      </Box>
    )
  }

  // Scrolling window — keep cursor near the center
  const scrollStart = Math.max(
    0,
    Math.min(cursor - Math.floor(PAGE_SIZE / 2), sessions.length - PAGE_SIZE)
  )
  const visible = sessions.slice(scrollStart, scrollStart + PAGE_SIZE)

  return (
    <Box flexDirection="column">
      {/* Column header */}
      <Box paddingLeft={2}>
        <Text color={TEXT_DIM}>
          {'  #  Date          Duration  Intent              Prompts  Tools  Score'}
        </Text>
      </Box>

      {/* Rows */}
      {visible.map((s, i) => {
        const idx = scrollStart + i
        const isSelected = idx === cursor
        const num = (idx + 1).toString().padStart(2)
        const date = formatDate(s.started_at).padEnd(13)
        const dur = formatDuration(s.started_at, s.ended_at).padEnd(9)
        const intent = (s.dominant_intent ?? '—').padEnd(19)
        const prompts = s.prompt_count.toString().padStart(4)
        const tools = s.tool_use_count.toString().padStart(5)
        const score = s.satisfaction_score != null
          ? s.satisfaction_score.toString().padStart(5)
          : '    —'

        return (
          <Box key={s.session_id} paddingLeft={1}>
            <Text color={isSelected ? COPPER : undefined} bold={isSelected}>
              {isSelected ? '►' : ' '} {num}  {date} {dur} {intent} {prompts} {tools} {score}
            </Text>
          </Box>
        )
      })}

      {/* Footer hints */}
      <Box paddingLeft={2} marginTop={1}>
        <Text color={TEXT_DIM}>↑↓ navigate  ⏎ detail  q quit</Text>
      </Box>
    </Box>
  )
}
