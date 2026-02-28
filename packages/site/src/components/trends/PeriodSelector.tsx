'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { Period } from '@/lib/trends'

const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
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
    <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
      {PERIODS.map(p => (
        <button
          key={p.value}
          onClick={() => select(p.value)}
          className={`rounded-md px-3 py-1 text-sm transition-colors ${
            current === p.value
              ? 'bg-[#C8B6FF] text-[#0d0d1a] font-medium'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
