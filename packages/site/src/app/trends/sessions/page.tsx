import { querySessionArcs, queryRecentSessions, querySatisfactionTrend } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import SankeyFlow from '@/components/trends/SankeyFlow'
import TrendLine from '@/components/trends/TrendLine'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function SessionsPage({ searchParams }: Props) {
  const params = await searchParams
  const period = (params.period ?? '30d') as Period

  const [arcs, recent, satisfaction] = await Promise.all([
    querySessionArcs(period),
    queryRecentSessions(period),
    querySatisfactionTrend(period),
  ])

  return (
    <div className="space-y-10">
      {/* Intent → Outcome Sankey */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Intent → Outcome flow</h2>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <SankeyFlow arcs={arcs} />
        </div>
      </section>

      {/* Satisfaction trend */}
      {satisfaction.trend.length > 1 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-200">
            Satisfaction trend
            {satisfaction.avgScore != null && (
              <span className="ml-3 text-sm font-normal text-gray-400">
                avg: {satisfaction.avgScore}%
              </span>
            )}
          </h2>
          <TrendLine
            series={[{
              name: 'Satisfaction',
              data: satisfaction.trend.map(t => ({ date: t.date, count: t.score })),
              color: '#F5D89A',
            }]}
            height={250}
            yLabel="Score"
          />
        </section>
      )}

      {/* Satisfaction signals */}
      {satisfaction.signals.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-gray-200">Satisfaction signals</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {satisfaction.signals.map(s => (
              <div key={s.name} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs text-gray-400">{formatSignal(s.name)}</p>
                <p className="mt-1 text-xl font-bold text-white">{s.count}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent sessions */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-200">Recent sessions</h2>
        {recent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-gray-400">
                  <th className="pb-2 pr-4">When</th>
                  <th className="pb-2 pr-4">Intent</th>
                  <th className="pb-2 pr-4">Prompts</th>
                  <th className="pb-2 pr-4">Outcome</th>
                  <th className="pb-2">Satisfaction</th>
                </tr>
              </thead>
              <tbody>
                {recent.slice(0, 20).map(s => (
                  <tr key={s.session_id} className="border-b border-white/5 text-gray-300">
                    <td className="py-2 pr-4 text-gray-400">
                      {new Date(s.started_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4">{s.dominant_intent?.replace('_', ' ') ?? '—'}</td>
                    <td className="py-2 pr-4">{s.prompt_count}</td>
                    <td className="py-2 pr-4">
                      <span className={
                        s.outcome === 'completed' ? 'text-green-400' :
                        s.outcome === 'error_exit' ? 'text-red-400' : 'text-yellow-400'
                      }>
                        {s.outcome?.replace('_', ' ') ?? '—'}
                      </span>
                    </td>
                    <td className="py-2">
                      {s.satisfaction_score != null ? `${s.satisfaction_score}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No sessions in this period.</p>
        )}
      </section>
    </div>
  )
}

function formatSignal(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
