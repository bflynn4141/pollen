import type { Metadata } from 'next'
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })
const grotesk = Space_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-grotesk' })
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Trending Tool Calls — Pollen',
  description:
    'What tools and MCP servers coding agents actually call, week by week. K-anonymized: every number aggregates at least 5 contributors.',
}

export default function TrendingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${grotesk.variable} ${mono.variable} trends-warm min-h-screen font-[family-name:var(--font-inter)]`}>
      <header className="sticky top-0 z-50 border-b bg-[#FAFAF8]/95 backdrop-blur-sm" style={{ borderColor: 'var(--t-border)' }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm transition-colors" style={{ color: 'var(--t-text-dim)' }}>
              ← pollen
            </Link>
            <h1 className="font-[family-name:var(--font-grotesk)] text-lg font-semibold" style={{ color: 'var(--t-text)' }}>
              Trending <span style={{ color: 'var(--t-accent)' }}>Tool Calls</span>
            </h1>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" style={{ color: 'var(--t-text-muted)' }}>Dashboard</Link>
            <Link href="/docs/api" style={{ color: 'var(--t-text-muted)' }}>API</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pb-24 pt-10">
        {children}
      </main>
    </div>
  )
}
