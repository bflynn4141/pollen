import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  fetchDashboard,
  isDashboardScope,
  RANKING_SECTION_META,
  RANKING_WINDOWS,
  type RankingEntry,
  type RankingSection,
  type RankingWindow,
} from '@/lib/network-dashboard'
import { DashboardIcon, EntityMark, type DashboardIconName } from '../dashboard-icons'
import { dashboardHref, DashboardScopeSwitch } from '../dashboard-scope-switch'
import home from '../dashboard.module.css'
import styles from './ranking-page.module.css'

export const revalidate = 300

const number = new Intl.NumberFormat('en-US')
const sections: RankingSection[] = ['models', 'mcps', 'tools', 'workflows', 'intents']
const sectionIcons: Record<RankingSection, DashboardIconName> = {
  models: 'models',
  mcps: 'tools',
  tools: 'tools',
  workflows: 'workflow',
  intents: 'intent',
}

export function generateStaticParams() {
  return sections.map(section => ({ section }))
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params
  if (!sections.includes(section as RankingSection)) return {}
  const definition = RANKING_SECTION_META[section as RankingSection]
  return {
    title: `${definition.label} — Pollen`,
    description: definition.description,
  }
}

function isRankingWindow(value: string | string[] | undefined): value is RankingWindow {
  return typeof value === 'string' && RANKING_WINDOWS.some(item => item.id === value)
}

function iconTone(entry: RankingEntry): string {
  if (entry.secondary === 'Anthropic') return home.iconAnthropic
  if (entry.secondary === 'OpenAI') return home.iconOpenAI
  const key = `icon${entry.id.replace(/(^|-)(\w)/g, (_, _dash, char: string) => char.toUpperCase())}`
  return home[key] ?? home.iconTool
}

function TrendLine({ entry }: { entry: RankingEntry }) {
  const values = RANKING_WINDOWS.flatMap(item => {
    const metric = entry.windows[item.id]
    return metric ? [{ id: item.id, value: metric.adoptionPct }] : []
  })
  if (values.length < 2) return <span aria-label="Not enough history">—</span>
  const min = Math.min(...values.map(item => item.value))
  const max = Math.max(...values.map(item => item.value))
  const range = max - min || 1
  const points = values.map((item, index) => `${4 + index * (44 / (values.length - 1))},${18 - ((item.value - min) / range) * 13}`).join(' ')

  return (
    <svg className={styles.sparkline} viewBox="0 0 52 22" aria-label={`Adoption trend: ${values.map(item => item.value).join('%, ')}%`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.split(' ').map((point, index) => {
        const [cx, cy] = point.split(',')
        return <circle key={values[index].id} cx={cx} cy={cy} r="1.8" fill="currentColor" />
      })}
    </svg>
  )
}

export default async function RankingPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>
  searchParams: Promise<{ scope?: string | string[]; window?: string | string[]; view?: string | string[] }>
}) {
  const [{ section }, query] = await Promise.all([params, searchParams])
  if (!sections.includes(section as RankingSection)) notFound()

  const activeSection = section as RankingSection
  const selectedWindow: RankingWindow = isRankingWindow(query.window) ? query.window : '7d'
  const requestedScope = isDashboardScope(query.scope) ? query.scope : undefined
  const dashboard = await fetchDashboard(requestedScope)
  const isPersonal = dashboard.scope === 'personal'
  const scopedHref = (path: string) => dashboardHref(path, dashboard.scope)
  const mcpView: 'tools' | 'servers' = query.view === 'tools' ? 'tools' : 'servers'
  const definition = activeSection === 'mcps' && mcpView === 'tools'
    ? dashboard.mcpTools
    : dashboard.rankings[activeSection]
  const rankingHref = (window: RankingWindow, view = mcpView) => {
    return dashboardHref(
      `/dashboard/${activeSection}`,
      dashboard.scope,
      window,
      activeSection === 'mcps' ? view : undefined,
    )
  }
  const icon = sectionIcons[activeSection]
  const candidates = definition.entries
    .flatMap(entry => entry.windows[selectedWindow] ? [entry] : [])
  const isAttributedSection = activeSection === 'tools' || activeSection === 'mcps'
  const showAttributedTokens = isAttributedSection && candidates.some(entry =>
    (entry.windows[selectedWindow]!.tokenizedEvents ?? 0) > 0
  )
  const ranked = candidates.sort((left, right) => showAttributedTokens
    ? right.windows[selectedWindow]!.volume - left.windows[selectedWindow]!.volume
    : right.windows[selectedWindow]!.adoptionPct - left.windows[selectedWindow]!.adoptionPct)
  const totalVolume = ranked.reduce((sum, entry) => sum + entry.windows[selectedWindow]!.volume, 0)
  const totalCalls = ranked.reduce((sum, entry) => sum + (entry.windows[selectedWindow]!.calls ?? 0), 0)
  const attributedCalls = ranked.reduce((sum, entry) => sum + (entry.windows[selectedWindow]!.tokenizedEvents ?? 0), 0)
  const topMover = [...ranked].filter(entry => entry.windows[selectedWindow]!.trendPct !== null)
    .sort((left, right) => (right.windows[selectedWindow]!.trendPct ?? 0) - (left.windows[selectedWindow]!.trendPct ?? 0))[0]
  const reliabilityFloor = isPersonal ? Math.max(5, totalCalls * 0.01) : 0
  const reliabilityPool = ranked.filter(entry => (entry.windows[selectedWindow]!.calls ?? entry.windows[selectedWindow]!.volume) >= reliabilityFloor)
  const mostReliable = [...(reliabilityPool.length ? reliabilityPool : ranked)]
    .sort((left, right) => right.windows[selectedWindow]!.completionPct - left.windows[selectedWindow]!.completionPct)[0]
  const isMcpRanking = activeSection === 'mcps'
  const showTokenMetrics = activeSection === 'models' && ranked.some(entry =>
    (entry.windows[selectedWindow]!.tokenizedSessions ?? 0) > 0
  )
  const totalTokens = showTokenMetrics
    ? ranked.reduce((sum, entry) => sum + (entry.windows[selectedWindow]!.totalTokens ?? 0), 0)
    : 0
  const measuredSessions = showTokenMetrics
    ? ranked.reduce((sum, entry) => sum + (entry.windows[selectedWindow]!.tokenizedSessions ?? 0), 0)
    : 0
  const contributorCount = ranked.reduce(
    (highest, entry) => Math.max(highest, entry.windows[selectedWindow]!.eligibleContributors),
    dashboard.overview?.contributors ?? (isPersonal ? 1 : 0),
  )
  const contributorLabel = `${contributorCount} contributor${contributorCount === 1 ? '' : 's'}`
  const volumeLabel = isAttributedSection
    ? showAttributedTokens ? 'Attributed tokens' : 'Calls'
    : definition.volumeLabel
  const shareLabel = showAttributedTokens ? 'Compute share' : isPersonal ? 'Usage share' : definition.adoptionLabel

  return (
    <div className={home.terminalShell}>
      <aside className={home.sidebar}>
        <Link href="/" className={home.brand} aria-label="Pollen home"><span className={home.brandMark}>P</span><strong>Pollen</strong></Link>
        <nav className={home.nav} aria-label="Dashboard pages">
          <Link href={scopedHref('/dashboard')} aria-label="Overview"><span><DashboardIcon name="market" /></span>Overview</Link>
          {sections.map(item => (
            <Link key={item} href={scopedHref(`/dashboard/${item}`)} className={item === activeSection ? home.navActive : undefined} aria-label={RANKING_SECTION_META[item].label}>
              <span><DashboardIcon name={sectionIcons[item]} /></span>{RANKING_SECTION_META[item].label.replace(' rankings', 's')}
            </Link>
          ))}
        </nav>
      </aside>

      <main className={home.main}>
        <header className={home.mobileTopbar}>
          <Link href={scopedHref('/dashboard')} className={home.mobileBrand} aria-label="Pollen dashboard"><span className={home.brandMark}>P</span><strong>Pollen</strong></Link>
        </header>

        <section className={styles.rankingHeader}>
          <div className={styles.titleRow}>
            <div className={styles.titleCopy}><span className={styles.titleIcon}><DashboardIcon name={icon} size={20} /></span><h1>{definition.label}</h1></div>
            <div className={styles.headerControls}>
              <DashboardScopeSwitch
                dashboard={dashboard}
                path={`/dashboard/${activeSection}`}
                window={selectedWindow}
                view={activeSection === 'mcps' ? mcpView : undefined}
              />
              <span className={home.scopeBadge}>{contributorLabel}</span>
              {activeSection === 'mcps' ? <nav className={styles.windowToggle} aria-label="MCP ranking type">
                <Link href={rankingHref(selectedWindow, 'servers')} className={mcpView === 'servers' ? styles.windowActive : undefined} aria-current={mcpView === 'servers' ? 'page' : undefined}>Servers</Link>
                <Link href={rankingHref(selectedWindow, 'tools')} className={mcpView === 'tools' ? styles.windowActive : undefined} aria-current={mcpView === 'tools' ? 'page' : undefined}>Tools</Link>
              </nav> : null}
              <nav className={styles.windowToggle} aria-label="Ranking interval">
                {RANKING_WINDOWS.map(item => <Link key={item.id} href={rankingHref(item.id)} className={item.id === selectedWindow ? styles.windowActive : undefined} aria-current={item.id === selectedWindow ? 'page' : undefined}>{item.label}</Link>)}
              </nav>
            </div>
          </div>
          {ranked.length > 0 ? <div className={styles.summaryStrip}>
            <div><small>{volumeLabel}</small><strong>{number.format(totalVolume)}</strong>{showAttributedTokens ? <span>{number.format(attributedCalls)}/{number.format(totalCalls)} calls attributed</span> : null}</div>
            {showTokenMetrics ? <div><small>Tokens processed</small><strong>{number.format(totalTokens)}</strong><span>{number.format(measuredSessions)}/{number.format(totalVolume)} runs measured</span></div> : null}
            <div><small>Top mover</small><strong className={styles.summaryEntity}>{topMover?.label ?? 'Not enough history'}</strong>{topMover ? <span className={styles.up}>{topMover.windows[selectedWindow]!.trendPct! >= 0 ? '+' : ''}{topMover.windows[selectedWindow]!.trendPct}%</span> : null}</div>
            <div><small>{isPersonal || isMcpRanking ? 'Best success' : 'Best completion'}</small><strong className={styles.summaryEntity}>{mostReliable.label}</strong><span>{mostReliable.windows[selectedWindow]!.completionPct}%</span></div>
          </div> : null}
        </section>

        {ranked.length > 0 ? <div className={styles.contentGrid}>
          <section className={styles.rankingPanel}>
            <div className={styles.tableScroll}>
              <table className={styles.rankingTable}>
                <thead><tr><th>#</th><th>{definition.singular}</th>{activeSection === 'workflows' ? <th>Sequence</th> : null}<th>{shareLabel}</th>{isPersonal ? null : <th>Users</th>}<th>{volumeLabel}</th>{showAttributedTokens ? <th>Calls</th> : null}{showTokenMetrics ? <><th>Measured</th><th>Tokens</th><th>Cached</th><th>Reasoning</th></> : null}<th>{isPersonal || isMcpRanking ? 'Success' : 'Completion'}</th>{isMcpRanking ? <th>Latency</th> : null}<th>Trend</th><th>Δ prev.</th></tr></thead>
                <tbody>
                  {ranked.map((entry, index) => {
                    const value = entry.windows[selectedWindow]!
                    return (
                      <tr key={entry.id}>
                        <td className={styles.rank}>{String(index + 1).padStart(2, '0')}</td>
                        <td><div className={styles.entity}><span className={`${home.entityIcon} ${iconTone(entry)}`}>{activeSection === 'workflows' ? <DashboardIcon name="workflow" /> : <EntityMark id={entry.iconId ?? entry.id} provider={entry.secondary} />}</span><span><strong>{entry.label}</strong><small>{entry.secondary}</small></span></div></td>
                        {activeSection === 'workflows' ? <td><div className={styles.sequence}>{entry.sequence?.map((step, stepIndex) => <span key={step}>{step}{stepIndex < (entry.sequence?.length ?? 0) - 1 ? <i>›</i> : null}</span>)}</div></td> : null}
                        <td><div className={styles.adoption}><strong>{value.adoptionPct}%</strong><span><i style={{ width: `${value.adoptionPct}%` }} /></span></div></td>
                        {isPersonal ? null : <td className={styles.mono}>{value.contributors}/{value.eligibleContributors}</td>}
                        <td className={styles.mono}>{number.format(value.volume)}</td>
                        {showAttributedTokens ? <td className={styles.mono}>{number.format(value.calls ?? 0)}</td> : null}
                        {showTokenMetrics ? <>
                          <td className={styles.mono}>{number.format(value.tokenizedSessions ?? 0)}/{number.format(value.volume)}</td>
                          <td className={styles.mono}>{number.format(value.totalTokens ?? 0)}</td>
                          <td className={styles.mono}>{number.format(value.cachedInputTokens ?? 0)}</td>
                          <td className={styles.mono}>{value.reasoningTokens == null ? '—' : number.format(value.reasoningTokens)}</td>
                        </> : null}
                        <td><span className={styles.score}>{value.completionPct}%</span></td>
                        {isMcpRanking ? <td className={styles.mono}>{value.latencyBucket?.replace('_', ' ') ?? '—'}</td> : null}
                        <td><TrendLine entry={entry} /></td>
                        <td><span className={value.trendPct == null || value.trendPct >= 0 ? styles.changeUp : styles.changeDown}>{value.trendPct == null ? '—' : `${value.trendPct >= 0 ? '+' : ''}${value.trendPct}%`}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div> : (
          <section className={home.networkState}>
            <span>{isPersonal ? 'LOCAL DATA' : dashboard.status === 'unavailable' ? 'NETWORK UNAVAILABLE' : 'NETWORK WARMING UP'}</span>
            <h2>{isPersonal ? `No ${definition.label.toLowerCase()} for ${RANKING_WINDOWS.find(item => item.id === selectedWindow)?.label}.` : `No public ${definition.label.toLowerCase()} for ${RANKING_WINDOWS.find(item => item.id === selectedWindow)?.label}.`}</h2>
            <p>{isPersonal ? 'Use Codex or Claude Code, then refresh.' : dashboard.status === 'unavailable' ? 'Try again shortly.' : `Rankings publish when at least ${dashboard.kAnonymity} contributors qualify.`}</p>
          </section>
        )}
      </main>
    </div>
  )
}
