import { Suspense } from 'react'
import { querySubjectExplore } from '@/lib/queries'
import type { Period } from '@/lib/trends'
import NormalizedTrendLine from '@/components/trends/NormalizedTrendLine'
import SearchHero from '@/components/trends/SearchHero'

interface Props {
  searchParams: Promise<{ q?: string; period?: string }>
}

export default async function ExplorePage({ searchParams }: Props) {
  const params = await searchParams
  const query = params.q
  const period = (params.period ?? 'all') as Period

  // No query yet — show search only
  if (!query) {
    return (
      <div className="space-y-8 pt-12">
        <SearchHero />
        <p className="text-center text-sm text-gray-500">
          Enter a query to see interest over time
        </p>
      </div>
    )
  }

  const data = await querySubjectExplore(query, period)

  return (
    <div className="space-y-8">
      {/* Search bar (persistent) */}
      <SearchHero />

      {/* Results header */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-white">
          Results for <span className="text-[#C8B6FF]">&ldquo;{query}&rdquo;</span>
        </h2>
        <span className="text-sm text-gray-400">
          {data.totalSessions} session{data.totalSessions !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Interest over time */}
      <section>
        <h3 className="mb-4 text-lg font-medium text-gray-200">Interest over time</h3>
        <Suspense fallback={<ChartSkeleton />}>
          <NormalizedTrendLine data={data.series} />
        </Suspense>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Related subjects */}
        {data.relatedSubjects.length > 0 && (
          <section>
            <h3 className="mb-4 text-lg font-medium text-gray-200">Related subjects</h3>
            <div className="space-y-2">
              {data.relatedSubjects.map(r => (
                <a
                  key={r.subject}
                  href={`/trends/explore?q=${encodeURIComponent(r.subject)}`}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm transition-colors hover:border-[#C8B6FF]/30"
                >
                  <span className="text-gray-300">{r.subject}</span>
                  <span className="text-xs text-gray-500">{r.count}</span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Matching sessions */}
        {data.sessions.length > 0 && (
          <section>
            <h3 className="mb-4 text-lg font-medium text-gray-200">Sessions</h3>
            <div className="space-y-2">
              {data.sessions.slice(0, 10).map(s => (
                <div
                  key={s.session_id}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white">{s.subject}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(s.started_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-1 flex gap-3 text-xs text-gray-500">
                    <span>{s.prompt_count} prompts</span>
                    {s.dominant_intent && <span>{s.dominant_intent}</span>}
                    {s.outcome && (
                      <span className={s.outcome === 'completed' ? 'text-green-400/70' : 'text-gray-500'}>
                        {s.outcome}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return <div className="h-[320px] animate-pulse rounded-xl bg-white/5" />
}
