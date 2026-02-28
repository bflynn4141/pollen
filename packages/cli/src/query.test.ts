import { describe, expect, it } from 'vitest'
import { bar, renderIntents, renderStats, renderWhen } from './query.js'

describe('bar', () => {
  it('renders 50% bar', () => {
    const b = bar(0.5, 10)
    expect(b).toBe('\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591')
  })

  it('renders 0% bar', () => {
    const b = bar(0, 10)
    expect(b).toBe('\u2591'.repeat(10))
  })

  it('renders 100% bar', () => {
    const b = bar(1, 10)
    expect(b).toBe('\u2588'.repeat(10))
  })
})

describe('renderStats', () => {
  it('shows no data message when empty', () => {
    expect(renderStats({ total: 0, firstSeen: null, lastSeen: null, uniqueSessions: 0 }))
      .toContain('No data yet')
  })

  it('renders stats with data', () => {
    const output = renderStats({ total: 42, firstSeen: Date.now(), lastSeen: Date.now(), uniqueSessions: 5 })
    expect(output).toContain('42')
    expect(output).toContain('5')
  })
})

describe('renderIntents', () => {
  it('renders intent distribution', () => {
    const output = renderIntents([
      { intent: 'debugging', count: 10 },
      { intent: 'feature_build', count: 5 },
    ])
    expect(output).toContain('debugging')
    expect(output).toContain('feature_build')
    expect(output).toContain('67%')
  })

  it('shows no data message when empty', () => {
    expect(renderIntents([])).toContain('No data')
  })
})

describe('renderWhen', () => {
  it('renders peak hours', () => {
    const output = renderWhen({
      byHour: [
        { bucket: 'afternoon', count: 20 },
        { bucket: 'morning', count: 10 },
      ],
      byDay: [
        { bucket: 'tuesday', count: 15 },
      ],
    })
    expect(output).toContain('afternoon')
    expect(output).toContain('tuesday')
  })
})
