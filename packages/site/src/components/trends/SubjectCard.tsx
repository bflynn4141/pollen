'use client'

import Link from 'next/link'

interface Props {
  subject: string
  count: number
  growth: number | null
  rank?: number
}

export default function SubjectCard({ subject, count, growth, rank }: Props) {
  return (
    <Link
      href={`/trends/explore?q=${encodeURIComponent(subject)}`}
      className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:border-[#C8B6FF]/30 hover:bg-white/[0.07]"
    >
      {rank != null && (
        <span className="text-2xl font-bold text-gray-600">{rank}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white group-hover:text-[#C8B6FF]">
          {subject}
        </p>
        <p className="text-xs text-gray-500">
          {count} session{count !== 1 ? 's' : ''}
        </p>
      </div>
      {growth != null && (
        <span className={`text-xs font-medium ${growth > 0 ? 'text-green-400' : growth < 0 ? 'text-red-400' : 'text-gray-500'}`}>
          {growth > 0 ? '+' : ''}{growth}%
        </span>
      )}
    </Link>
  )
}
