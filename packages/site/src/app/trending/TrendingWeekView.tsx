import Link from 'next/link'
import type {
  McpServerRank,
  NetworkOverview,
  TrendingTool,
} from '@pollen/data'
import { K_ANONYMITY } from '@pollen/data'
import { weekRangeLabel } from '@pollen/data'

// Pure presentational server component: receives k-anonymized rollup data as
// props. All data access lives in the pages via @pollen/data.

interface Props {
  week: string
  weeks: string[]
  overview: NetworkOverview | null
  tools: TrendingTool[]
  mcpServers: McpServerRank[]
}

function TrendBadge({ tool }: { tool: TrendingTool }) {
  if (tool.isNew) {
    return (
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ background: '#EAF3EC', color: 'var(--t-trend-up)' }}
      >
        new
      </span>
    )
  }
  if (tool.trend === 'stable' || tool.changePct == null) {
    return <span className="text-xs" style={{ color: 'var(--t-text-dim)' }}>—</span>
  }
  const up = tool.trend === 'up'
  return (
    <span
      className="text-xs font-medium"
      style={{ color: up ? 'var(--t-trend-up)' : 'var(--t-trend-down)' }}
    >
      {up ? '↑' : '↓'} {Math.abs(tool.changePct)}%
    </span>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>{label}</p>
      <p className="mt-1 font-[family-name:var(--font-grotesk)] text-2xl font-bold" style={{ color: 'var(--t-text)' }}>
        {value}
      </p>
    </div>
  )
}

export default function TrendingWeekView({ week, weeks, overview, tools, mcpServers }: Props) {
  const idx = weeks.indexOf(week)
  const newer = idx > 0 ? weeks[idx - 1] : null
  const older = idx >= 0 && idx < weeks.length - 1 ? weeks[idx + 1] : null

  return (
    <div className="space-y-10">
      {/* Week header + navigation */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-grotesk)] text-3xl font-bold" style={{ color: 'var(--t-text)' }}>
            {week}
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--t-text-muted)' }}>
            {weekRangeLabel(week)} · UTC · vs previous week
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {older ? (
            <Link
              href={`/trending/${older}`}
              className="rounded-lg border px-3 py-1.5 transition-colors"
              style={{ borderColor: 'var(--t-border)', color: 'var(--t-text-muted)' }}
            >
              ← {older}
            </Link>
          ) : null}
          {newer ? (
            <Link
              href={`/trending/${newer}`}
              className="rounded-lg border px-3 py-1.5 transition-colors"
              style={{ borderColor: 'var(--t-border)', color: 'var(--t-text-muted)' }}
            >
              {newer} →
            </Link>
          ) : null}
        </div>
      </div>

      {/* Overview strip */}
      {overview && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Tool calls" value={overview.toolCalls.toLocaleString()} />
          <StatCard label="Sessions" value={overview.sessions.toLocaleString()} />
          <StatCard label="Tools seen" value={overview.tools.toLocaleString()} />
          <StatCard label="Contributors" value={overview.contributors.toLocaleString()} />
        </div>
      )}

      {/* Tools table */}
      <section>
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
          Trending tools
        </h3>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--t-text-dim)' }}>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Tool</th>
                <th className="px-4 py-3 text-right font-medium">Calls</th>
                <th className="px-4 py-3 text-right font-medium">WoW</th>
                <th className="px-4 py-3 text-right font-medium">Success</th>
                <th className="px-4 py-3 text-right font-medium">Contributors</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t, i) => (
                <tr key={t.tool} className="border-t" style={{ borderColor: 'var(--t-border)' }}>
                  <td className="px-4 py-2.5" style={{ color: 'var(--t-text-dim)' }}>{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-[family-name:var(--font-mono)]" style={{ color: 'var(--t-text)' }}>
                      {t.kind === 'mcp' && t.server ? t.tool.replace(`mcp__${t.server}__`, `${t.server} · `) : t.tool}
                    </span>
                    {t.kind === 'mcp' && (
                      <span
                        className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase"
                        style={{ background: 'var(--t-bar-track)', color: 'var(--t-text-muted)' }}
                      >
                        mcp
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right" style={{ color: 'var(--t-text)' }}>{t.calls.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right"><TrendBadge tool={t} /></td>
                  <td className="px-4 py-2.5 text-right" style={{ color: 'var(--t-text-muted)' }}>{t.successPct}%</td>
                  <td className="px-4 py-2.5 text-right" style={{ color: 'var(--t-text-dim)' }}>{t.contributors}</td>
                </tr>
              ))}
              {tools.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--t-text-dim)' }}>
                    No published cells for this week yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* MCP servers table */}
      {mcpServers.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium uppercase tracking-wide" style={{ color: 'var(--t-text-muted)' }}>
            MCP servers
          </h3>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: 'var(--t-text-dim)' }}>
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Server</th>
                  <th className="px-4 py-3 text-right font-medium">Calls</th>
                  <th className="px-4 py-3 text-right font-medium">Sessions</th>
                  <th className="px-4 py-3 text-right font-medium">Success</th>
                  <th className="px-4 py-3 text-right font-medium">Contributors</th>
                </tr>
              </thead>
              <tbody>
                {mcpServers.map((s, i) => (
                  <tr key={s.server} className="border-t" style={{ borderColor: 'var(--t-border)' }}>
                    <td className="px-4 py-2.5" style={{ color: 'var(--t-text-dim)' }}>{i + 1}</td>
                    <td className="px-4 py-2.5 font-[family-name:var(--font-mono)]" style={{ color: 'var(--t-text)' }}>{s.server}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: 'var(--t-text)' }}>{s.calls.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: 'var(--t-text-muted)' }}>{s.sessions.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: 'var(--t-text-muted)' }}>{s.successPct}%</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: 'var(--t-text-dim)' }}>{s.contributors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Methodology + API CTA */}
      <section
        className="rounded-xl border p-5 text-sm"
        style={{ borderColor: 'var(--t-border)', background: 'var(--t-surface)', color: 'var(--t-text-muted)' }}
      >
        <p>
          <strong style={{ color: 'var(--t-text)' }}>k-anonymized.</strong>{' '}
          Every number on this page aggregates at least {K_ANONYMITY} distinct contributors — cells below that
          threshold are suppressed before they are ever written. Weeks are frozen once they leave the recompute
          window, so this URL is a stable citation.
        </p>
        <p className="mt-3">
          Get this data as JSON:{' '}
          <code className="font-[family-name:var(--font-mono)]" style={{ color: 'var(--t-accent)' }}>
            GET api.pollen.id/trending/tools
          </code>{' '}
          (free) — full history via the paid x402 endpoints.{' '}
          <Link href="/docs/api" style={{ color: 'var(--t-accent)' }}>API docs →</Link>
        </p>
      </section>
    </div>
  )
}
