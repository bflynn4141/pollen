import { describe, expect, it } from 'vitest'
import { receiptRollingWindows } from '@pollen/data'

describe('receiptRollingWindows', () => {
  it('builds adjacent current and previous periods for every dashboard interval', () => {
    const end = new Date('2026-08-13T12:00:00.000Z')
    const windows = receiptRollingWindows(end)

    expect(windows.map(window => window.period)).toEqual([
      'rolling:24h:current',
      'rolling:24h:previous',
      'rolling:7d:current',
      'rolling:7d:previous',
      'rolling:30d:current',
      'rolling:30d:previous',
    ])
    for (let index = 0; index < windows.length; index += 2) {
      const current = windows[index]
      const previous = windows[index + 1]
      expect(previous.endMs).toBe(current.startMs)
      expect(previous.endMs - previous.startMs).toBe(current.endMs - current.startMs)
    }
  })
})
