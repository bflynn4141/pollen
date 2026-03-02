'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/topics', label: 'Topics' },
  { href: '/tools', label: 'Tool Calls' },
  { href: '/commands', label: 'Commands' },
  { href: '/models', label: 'Models' },
]

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="mx-auto max-w-[1344px] px-12 pb-16 pt-12">
      {/* Header */}
      <h1 className="font-[family-name:var(--font-grotesk)] text-[32px] font-bold leading-tight tracking-[-0.03em] text-text">
        Prompt Trends
      </h1>
      <p className="mt-1 text-sm text-text-muted">
        Real-time intelligence on Claude Code usage
      </p>

      {/* Tabs */}
      <div className="mt-8 flex gap-6 border-b border-card-border">
        {TABS.map(tab => {
          const active = pathname === tab.href
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative pb-3 text-[13px] transition-colors"
              style={{
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--color-text)' : 'var(--color-tab-inactive)',
              }}
            >
              {tab.label}
              {active && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: 'var(--color-tab-active-border)' }}
                />
              )}
            </Link>
          )
        })}
      </div>

      {/* Content */}
      <div className="mt-8">
        {children}
      </div>
    </div>
  )
}
