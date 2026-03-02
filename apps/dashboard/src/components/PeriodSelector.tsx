'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { Period } from '@/lib/types'

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
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
    <div className="flex rounded-md bg-pill-bg p-0.5">
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => select(p.value)}
          className={`rounded-[5px] px-3 py-[5px] text-[11px] font-semibold transition-colors ${
            current === p.value
              ? 'bg-pill-active text-white'
              : 'text-text-dim hover:text-text-muted'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
