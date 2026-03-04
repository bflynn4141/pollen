'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { Period } from '@/lib/trends'

const PERIODS: { value: Period; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

export default function PeriodSelector() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = (searchParams.get('period') ?? '30d') as Period

  function select(period: Period) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', period)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div
      className="flex rounded-md p-0.5"
      style={{ background: 'var(--pill-bg)' }}
    >
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => select(p.value)}
          className="rounded-[5px] px-3 py-[5px] text-[11px] font-semibold transition-colors"
          style={{
            background: current === p.value ? 'var(--pill-active)' : 'transparent',
            color: current === p.value ? '#FFFFFF' : 'var(--text-dim)',
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
