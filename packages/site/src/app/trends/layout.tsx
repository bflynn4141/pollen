import type { Metadata } from 'next'
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import Link from 'next/link'
import { Suspense } from 'react'
import PeriodSelector from '@/components/trends/PeriodSelector'

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })
const grotesk = Space_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-grotesk' })
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Pollen Trends — Claude Code Usage Intelligence',
  description: 'Explore how developers use Claude Code: MCP ecosystem, tools, permission modes, and session patterns.',
}

const SECTIONS = [
  { id: 'mcp', label: 'MCP' },
  { id: 'overview', label: 'Overview' },
  { id: 'tools', label: 'Tools' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'behavior', label: 'Behavior' },
]

export default function TrendsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${grotesk.variable} ${mono.variable} trends-warm min-h-screen font-[family-name:var(--font-inter)]`}>
      <header className="sticky top-0 z-50 border-b bg-[#FAFAF8]/95 backdrop-blur-sm" style={{ borderColor: 'var(--t-border)' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm transition-colors" style={{ color: 'var(--t-text-dim)' }}>
              ← pollen
            </Link>
            <h1 className="font-[family-name:var(--font-grotesk)] text-lg font-semibold" style={{ color: 'var(--t-text)' }}>
              Pollen <span style={{ color: 'var(--t-accent)' }}>Trends</span>
            </h1>
          </div>
          <Suspense fallback={null}>
            <PeriodSelector />
          </Suspense>
        </div>

        <nav className="mx-auto max-w-6xl px-6">
          <div className="flex gap-1 overflow-x-auto">
            {SECTIONS.map(section => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="whitespace-nowrap border-b-2 border-transparent px-4 py-2 text-sm transition-colors hover:border-[#C66A3B]/50"
                style={{ color: 'var(--t-text-muted)' }}
              >
                {section.label}
              </a>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24">
        {children}
      </main>
    </div>
  )
}
