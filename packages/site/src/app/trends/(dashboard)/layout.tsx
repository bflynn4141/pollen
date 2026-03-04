import { Suspense } from 'react'
import Link from 'next/link'
import DashboardTabs from '@/components/dashboard/DashboardTabs'
import StatCards from '@/components/dashboard/StatCards'
import { queryDashboardStats } from '@/lib/queries'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const stats = await queryDashboardStats()

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <div className="mx-auto max-w-[1280px] px-10 pt-10 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1
              className="font-[family-name:var(--font-grotesk)] text-[32px] font-bold leading-tight tracking-[-0.02em]"
              style={{ color: 'var(--text)' }}
            >
              Prompt Trends
            </h1>
            <p className="mt-1 text-[14px]" style={{ color: 'var(--text-muted)' }}>
              Topic analytics across captured sessions
            </p>
          </div>

          {/* Revenue badge */}
          <div
            className="flex items-center overflow-hidden rounded-lg text-[13px] font-semibold"
            style={{ background: 'var(--card-dark)' }}
          >
            <span className="px-3 py-2" style={{ color: 'var(--accent)' }}>
              $48,291
            </span>
            <span className="py-2 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'rgba(250,250,248,0.4)' }}>
              query revenue
            </span>
            <span
              className="mx-1 h-3 w-px"
              style={{ background: 'rgba(250,250,248,0.15)' }}
            />
            <span className="px-2 py-2 text-white">2,847</span>
            <span className="py-2 text-[10px] uppercase tracking-[0.08em]" style={{ color: 'rgba(250,250,248,0.4)' }}>
              token holders
            </span>
            <Link
              href="/"
              className="ml-1 px-3 py-2 text-[12px] transition-opacity hover:opacity-80"
              style={{ color: 'rgba(250,250,248,0.7)' }}
            >
              Earn Now →
            </Link>
          </div>
        </div>

        {/* Stat cards — consistent across all tabs */}
        <div className="mt-8">
          <StatCards
            cards={[
              {
                label: 'Total Sessions',
                value: stats.totalSessions.toLocaleString(),
                subtitle: 'Last 30 days',
              },
              {
                label: 'Prompt Volume',
                value: stats.totalPrompts.toLocaleString(),
                subtitle: 'Captured contributions',
              },
              {
                label: 'Tool Events',
                value: stats.totalToolEvents.toLocaleString(),
                subtitle: 'MCP + built-in calls',
              },
            ]}
          />
        </div>

        {/* Tab navigation — below stat cards */}
        <div className="mt-8">
          <Suspense fallback={null}>
            <DashboardTabs />
          </Suspense>
        </div>

        {/* Page content */}
        <div className="mt-8">
          {children}
        </div>
      </div>
    </div>
  )
}
