import Link from 'next/link'
import { Suspense } from 'react'
import PeriodSelector from '@/components/trends/PeriodSelector'

const NAV = [
  { href: '/trends', label: 'Overview' },
  { href: '/trends/explore', label: 'Explore' },
  { href: '/trends/topics', label: 'Topics' },
  { href: '/trends/tools', label: 'Tools' },
  { href: '/trends/sessions', label: 'Sessions' },
  { href: '/trends/compare', label: 'Compare' },
]

export default function ExplorerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
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

      <main className="mx-auto max-w-7xl px-6 py-8">
        {children}
      </main>
    </div>
  )
}
