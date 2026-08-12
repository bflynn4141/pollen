import type Database from 'better-sqlite3'

// GitHub-style activity model for the Pollen Brief: a weeks × weekdays grid
// of daily prompt counts, plus streak stats. Sequential encoding — one green
// hue, light→dark (lightness-monotonic ramp), neutral zero cell.

export const HEAT_RAMP = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'] as const

export interface ActivityDay {
  /** date as YYYY-MM-DD in the requested timezone */
  date: string
  prompts: number
  /** 0 = none, 1..4 = quartile of non-zero days */
  level: 0 | 1 | 2 | 3 | 4
}

export interface ActivitySummary {
  /** columns oldest→newest; each column is Mon..Sun (nulls pad the current week) */
  weeks: (ActivityDay | null)[][]
  currentStreak: number
  longestStreak: number
  activeDays: number
  totalDays: number
}

export type ActivityTimezone = 'local' | 'UTC'

function dateKey(ts: number, timezone: ActivityTimezone): string {
  const d = new Date(ts)
  const y = timezone === 'UTC' ? d.getUTCFullYear() : d.getFullYear()
  const month = timezone === 'UTC' ? d.getUTCMonth() : d.getMonth()
  const date = timezone === 'UTC' ? d.getUTCDate() : d.getDate()
  const m = String(month + 1).padStart(2, '0')
  const day = String(date).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Monday of the week containing `d`, at midnight in the requested timezone. */
function mondayOf(d: Date, timezone: ActivityTimezone): Date {
  const out = timezone === 'UTC'
    ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    : new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = timezone === 'UTC' ? out.getUTCDay() : out.getDay()
  const dow = (day + 6) % 7 // Mon=0 .. Sun=6
  if (timezone === 'UTC') out.setUTCDate(out.getUTCDate() - dow)
  else out.setDate(out.getDate() - dow)
  return out
}

function addDays(date: Date, days: number, timezone: ActivityTimezone): void {
  if (timezone === 'UTC') date.setUTCDate(date.getUTCDate() + days)
  else date.setDate(date.getDate() + days)
}

export function computeActivity(
  db: Database.Database,
  opts: { weeks?: number; now?: number; timezone?: ActivityTimezone } = {},
): ActivitySummary {
  const weeksWanted = opts.weeks ?? 16
  const now = opts.now ?? Date.now()
  const timezone = opts.timezone ?? 'local'
  const today = new Date(now)
  const gridStart = mondayOf(today, timezone)
  addDays(gridStart, -7 * (weeksWanted - 1), timezone)

  const counts = new Map<string, number>()
  try {
    const rows = db.prepare(
      'SELECT timestamp FROM contributions WHERE timestamp >= ? AND timestamp <= ?'
    ).all(gridStart.getTime(), now) as { timestamp: number }[]
    for (const r of rows) {
      const key = dateKey(r.timestamp, timezone)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  } catch {
    // empty db — render an all-zero grid
  }

  // GitHub-style levels: quarters of the busiest day, so the max day is
  // always the darkest step and a lone light day is always the lightest.
  const maxCount = Math.max(0, ...counts.values())
  const levelOf = (n: number): ActivityDay['level'] => {
    if (n <= 0 || maxCount === 0) return 0
    return Math.min(4, Math.max(1, Math.ceil((4 * n) / maxCount))) as ActivityDay['level']
  }

  const todayKey = dateKey(now, timezone)
  const weeks: (ActivityDay | null)[][] = []
  const cursor = new Date(gridStart)
  for (let w = 0; w < weeksWanted; w++) {
    const col: (ActivityDay | null)[] = []
    for (let d = 0; d < 7; d++) {
      const key = dateKey(cursor.getTime(), timezone)
      if (key > todayKey) {
        col.push(null) // future days in the current week
      } else {
        const prompts = counts.get(key) ?? 0
        col.push({ date: key, prompts, level: levelOf(prompts) })
      }
      addDays(cursor, 1, timezone)
    }
    weeks.push(col)
  }

  // Streaks over the grid's day sequence (active = ≥1 prompt).
  const days = weeks.flat().filter((d): d is ActivityDay => d !== null)
  let longest = 0, run = 0
  for (const day of days) {
    run = day.prompts > 0 ? run + 1 : 0
    if (run > longest) longest = run
  }
  // Current streak: consecutive active days ending today, or yesterday when
  // today has no activity yet (GitHub semantics — today doesn't break it).
  let current = 0
  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i]
    if (day.prompts > 0) { current++; continue }
    if (day.date === todayKey && current === 0) continue // today, nothing yet
    break
  }

  return {
    weeks,
    currentStreak: current,
    longestStreak: longest,
    activeDays: days.filter(d => d.prompts > 0).length,
    totalDays: days.length,
  }
}
