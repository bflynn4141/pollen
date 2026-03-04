import type { Period } from './trends'

const VALID_PERIODS = new Set<Period>(['7d', '30d', '90d', 'all'])

export function parsePeriod(raw: string | null, fallback: Period = '30d'): Period {
  const value = raw ?? fallback
  return VALID_PERIODS.has(value as Period) ? (value as Period) : fallback
}

export function periodToMs(period: Period): number | null {
  if (period === 'all') return null
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  return Date.now() - days * 86_400_000
}

export function bucketInterval(period: Period): string {
  return period === '7d' ? 'day' : period === '90d' || period === 'all' ? 'week' : 'day'
}
