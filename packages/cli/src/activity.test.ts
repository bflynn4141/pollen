import { describe, expect, it, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { computeActivity, HEAT_RAMP } from './activity.js'
import { initDb } from './store.js'

const DAY = 24 * 60 * 60 * 1000
// Fixed anchor: Wed 2026-08-05 12:00 local
const NOW = new Date(2026, 7, 5, 12, 0, 0).getTime()

function insertPrompt(db: Database.Database, ts: number): void {
  db.prepare(
    'INSERT INTO contributions (id, timestamp, session_id, contributor_id) VALUES (?, ?, ?, ?)'
  ).run(crypto.randomUUID(), ts, 's-1', 'c-1')
}

describe('computeActivity', () => {
  let db: Database.Database
  beforeEach(() => { db = initDb() })

  it('builds a weeks×7 grid with future days as null', () => {
    const a = computeActivity(db, { weeks: 4, now: NOW })
    expect(a.weeks).toHaveLength(4)
    for (const week of a.weeks) expect(week).toHaveLength(7)
    const lastWeek = a.weeks[3]
    // NOW is a Wednesday: Mon/Tue/Wed present, Thu..Sun null
    expect(lastWeek[2]).not.toBeNull()
    expect(lastWeek[3]).toBeNull()
    expect(lastWeek[6]).toBeNull()
  })

  it('counts a current streak that includes today', () => {
    insertPrompt(db, NOW)             // today
    insertPrompt(db, NOW - DAY)       // yesterday
    insertPrompt(db, NOW - 2 * DAY)
    const a = computeActivity(db, { weeks: 4, now: NOW })
    expect(a.currentStreak).toBe(3)
  })

  it('does not break the current streak on an empty today', () => {
    insertPrompt(db, NOW - DAY)
    insertPrompt(db, NOW - 2 * DAY)
    const a = computeActivity(db, { weeks: 4, now: NOW })
    expect(a.currentStreak).toBe(2)
  })

  it('ends the current streak at a gap and tracks the longest separately', () => {
    insertPrompt(db, NOW)                  // today: 1-day current streak
    for (let i = 3; i <= 7; i++) insertPrompt(db, NOW - i * DAY) // older 5-day run
    const a = computeActivity(db, { weeks: 4, now: NOW })
    expect(a.currentStreak).toBe(1)
    expect(a.longestStreak).toBe(5)
  })

  it('assigns level 0 to empty days and quartile levels to active days', () => {
    insertPrompt(db, NOW)                                    // 1 prompt → low
    for (let i = 0; i < 40; i++) insertPrompt(db, NOW - DAY) // 40 → top quartile
    const a = computeActivity(db, { weeks: 2, now: NOW })
    const days = a.weeks.flat().filter(d => d !== null)
    const today = days.find(d => d!.prompts === 1)!
    const busy = days.find(d => d!.prompts === 40)!
    const empty = days.find(d => d!.prompts === 0)!
    expect(empty.level).toBe(0)
    expect(today.level).toBeGreaterThanOrEqual(1)
    expect(busy.level).toBe(4)
    expect(busy.level).toBeGreaterThan(today.level)
  })

  it('handles an empty database', () => {
    const a = computeActivity(db, { weeks: 4, now: NOW })
    expect(a.activeDays).toBe(0)
    expect(a.currentStreak).toBe(0)
    expect(a.longestStreak).toBe(0)
  })

  it('exports a 5-step lightness-monotonic ramp', () => {
    expect(HEAT_RAMP).toHaveLength(5)
    expect(new Set(HEAT_RAMP).size).toBe(5)
  })

  it('can bucket dates in UTC for portable snapshots', () => {
    const utcNow = Date.UTC(2026, 7, 5, 0, 30)
    insertPrompt(db, Date.UTC(2026, 7, 4, 23, 30))

    const a = computeActivity(db, { weeks: 1, now: utcNow, timezone: 'UTC' })
    const days = a.weeks.flat().filter(d => d !== null)

    expect(days.find(d => d!.date === '2026-08-04')?.prompts).toBe(1)
    expect(days.find(d => d!.date === '2026-08-05')?.prompts).toBe(0)
  })
})
