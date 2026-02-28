import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import { Suspense } from 'react'
import PeriodSelector from '@/components/trends/PeriodSelector'

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Pollen Trends — Claude Code Usage Intelligence',
  description: 'Google Trends-style dashboard for Claude Code usage patterns across topics, tools, and sessions.',
}

const NAV = [
  { href: '/trends', label: 'Overview' },
  { href: '/trends/explore', label: 'Explore' },
  { href: '/trends/topics', label: 'Topics' },
  { href: '/trends/tools', label: 'Tools' },
  { href: '/trends/sessions', label: 'Sessions' },
  { href: '/trends/compare', label: 'Compare' },
]

export default function TrendsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} min-h-screen bg-[#0d0d1a] text-white font-[family-name:var(--font-inter)]`}>
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0d0d1a]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-gray-400 hover:text-white text-sm">
              ← pollen
            </Link>
            <h1 className="text-lg font-semibold">
              <span className="text-[#C8B6FF]">Pollen</span> Trends
            </h1>
          </div>
          <Suspense fallback={null}>
            <PeriodSelector />
          </Suspense>
        </div>

        {/* Nav tabs */}
        <nav className="mx-auto max-w-7xl px-6">
          <div className="flex gap-1 overflow-x-auto">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap border-b-2 border-transparent px-4 py-2 text-sm text-gray-400 transition-colors hover:border-[#C8B6FF]/50 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {children}
      </main>
    </div>
  )
}
