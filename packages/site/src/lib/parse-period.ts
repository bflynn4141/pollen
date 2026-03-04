import type { Period } from './trends'

const VALID_PERIODS = new Set<Period>(['24h', '7d', '30d', '90d', 'all'])

export function parsePeriod(raw: string | null, fallback: Period = '30d'): Period {
  const value = raw ?? fallback
  return VALID_PERIODS.has(value as Period) ? (value as Period) : fallback
}

export function periodToMs(period: Period): number | null {
  if (period === 'all') return null
  const days = period === '24h' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 90
  return Date.now() - days * 86_400_000
}

export function bucketInterval(period: Period): string {
  if (period === '24h') return 'hour'
  if (period === '7d' || period === '30d') return 'day'
  return 'week'
}
