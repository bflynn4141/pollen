// ISO-week helpers (UTC). Week labels match Postgres to_char(ts, 'IYYY-"W"IW'),
// e.g. 2026-W32. Weeks start Monday.

export const WEEK_RE = /^\d{4}-W\d{2}$/

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

export function isValidWeek(week: string): boolean {
  if (!WEEK_RE.test(week)) return false
  const n = Number(week.slice(6))
  return n >= 1 && n <= 53
}

/** ISO week label for a date (UTC). */
export function isoWeekOf(date: Date): string {
  // Shift to the Thursday of this ISO week; its calendar year is the ISO year.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const isoYear = d.getUTCFullYear()
  const yearStart = Date.UTC(isoYear, 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/** Monday 00:00 UTC of the given ISO week. */
export function isoWeekStart(week: string): Date {
  const year = Number(week.slice(0, 4))
  const num = Number(week.slice(6))
  // Jan 4 is always in ISO week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const day = jan4.getUTCDay() || 7
  const mondayW1 = new Date(jan4.getTime() - (day - 1) * DAY_MS)
  return new Date(mondayW1.getTime() + (num - 1) * WEEK_MS)
}

export function currentWeek(now: Date = new Date()): string {
  return isoWeekOf(now)
}

/** Shift a week label by `delta` weeks (negative = past). */
export function shiftWeek(week: string, delta: number): string {
  return isoWeekOf(new Date(isoWeekStart(week).getTime() + delta * WEEK_MS))
}

export function prevWeek(week: string): string {
  return shiftWeek(week, -1)
}

/** The `n` most recent ISO weeks, newest first, including the current one. */
export function recentWeeks(n: number, now: Date = new Date()): string[] {
  const current = currentWeek(now)
  return Array.from({ length: n }, (_, i) => shiftWeek(current, -i))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Human label for a week, e.g. "Aug 3 – Aug 9, 2026". */
export function weekRangeLabel(week: string): string {
  const start = isoWeekStart(week)
  const end = new Date(start.getTime() + 6 * DAY_MS)
  const s = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`
  const e = `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`
  return `${s} – ${e}`
}
