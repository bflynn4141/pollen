export type ReceiptRankingWindow = '24h' | '7d' | '30d'
export type ReceiptWindowPosition = 'current' | 'previous'

export interface ReceiptRollingWindow {
  window: ReceiptRankingWindow
  position: ReceiptWindowPosition
  period: `rolling:${ReceiptRankingWindow}:${ReceiptWindowPosition}`
  startMs: number
  endMs: number
}

const DURATIONS: Array<[ReceiptRankingWindow, number]> = [
  ['24h', 24 * 60 * 60 * 1000],
  ['7d', 7 * 24 * 60 * 60 * 1000],
  ['30d', 30 * 24 * 60 * 60 * 1000],
]

/** Stable rolling-period definitions shared by the writer and API reader. */
export function receiptRollingWindows(now: Date = new Date()): ReceiptRollingWindow[] {
  const endMs = now.getTime()
  return DURATIONS.flatMap(([window, duration]) => {
    const currentStart = endMs - duration
    return [
      { window, position: 'current', period: `rolling:${window}:current`, startMs: currentStart, endMs },
      { window, position: 'previous', period: `rolling:${window}:previous`, startMs: currentStart - duration, endMs: currentStart },
    ]
  })
}
