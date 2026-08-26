import Link from 'next/link'
import { fetchContributorEarnings } from '@/lib/contributor-earnings'
import {
  fetchDashboard,
  isDashboardScope,
  type RankingSection,
} from '@/lib/network-dashboard'
import {
  DashboardIcon,
  EntityMark,
  type DashboardIconName,
} from './dashboard-icons'
import { dashboardHref, DashboardScopeSwitch } from './dashboard-scope-switch'
import { ContributorEarningsSummary } from './contributor-earnings-summary'
import styles from './dashboard.module.css'

export const revalidate = 300

const number = new Intl.NumberFormat('en-US')
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
function EntityIcon({ id, provider, section }: { id: string; provider?: string; section?: RankingSection }) {
  const tone = provider === 'Anthropic' ? styles.iconAnthropic
    : provider === 'OpenAI' ? styles.iconOpenAI
      : styles[`icon${id.replace(/(^|-)(\w)/g, (_, _dash, char: string) => char.toUpperCase())}`] ?? styles.iconTool

  return <span className={`${styles.entityIcon} ${tone}`} aria-hidden="true">{section === 'workflows' ? <DashboardIcon name="workflow" /> : <EntityMark id={id} provider={provider} />}</span>
}

function PanelTitle({ icon, title, href }: { icon: DashboardIconName; title: string; href?: string }) {
  return (
    <header className={styles.panelTitle}>
      <div className={styles.panelTitleCopy}>
        <span className={styles.panelGlyph}><DashboardIcon name={icon} /></span>
        <h2>{title}</h2>
      </div>
      <div className={styles.panelActions}>
        {href ? <Link href={href} className={styles.panelLink}>View all <DashboardIcon name="external" size={10} /></Link> : null}
      </div>
    </header>
  )
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>
}) {
  const query = await searchParams
  const requestedScope = isDashboardScope(query.scope) ? query.scope : undefined
  const [dashboard, earnings] = await Promise.all([
    fetchDashboard(requestedScope),
    requestedScope === 'network' ? Promise.resolve(null) : fetchContributorEarnings(),
  ])
  const isPersonal = dashboard.scope === 'personal'
  const moverWindow = isPersonal ? '7d' : '24h'
  const scopedHref = (path: string) => dashboardHref(path, dashboard.scope)
  const contributorCount = dashboard.overview?.contributors ?? (isPersonal ? 1 : 0)
  const contributorLabel = `${contributorCount} contributor${contributorCount === 1 ? '' : 's'}`
  const sections: Array<{ id: RankingSection; label: string; icon: DashboardIconName }> = [
    { id: 'models', label: 'Models', icon: 'models' },
    { id: 'mcps', label: 'MCPs', icon: 'tools' },
    { id: 'tools', label: 'Tools', icon: 'tools' },
    { id: 'workflows', label: 'Workflows', icon: 'workflow' },
    { id: 'intents', label: 'Intents', icon: 'intent' },
  ]
  const movers = sections
    .flatMap(section => dashboard.rankings[section.id].entries.flatMap(entry => {
      const metric = entry.windows[moverWindow]
      return metric ? [{ section, entry, metric }] : []
    }))
    .filter(item => item.metric.trendPct !== null)
    .sort((left, right) => (right.metric.trendPct ?? 0) - (left.metric.trendPct ?? 0))
    .slice(0, 6)
  const models = dashboard.rankings.models.entries.flatMap(entry => {
    const metric = entry.windows['7d']
    return metric ? [{ entry, metric }] : []
  }).sort((left, right) => right.metric.adoptionPct - left.metric.adoptionPct).slice(0, 6)
  const hasModelTokens = models.some(({ metric }) =>
    (metric.tokenizedSessions ?? 0) > 0 && metric.totalTokens != null
  )
  const tools = dashboard.rankings.tools.entries.flatMap(entry => {
    const metric = entry.windows['7d']
    return metric ? [{ entry, metric }] : []
  }).sort((left, right) => right.metric.adoptionPct - left.metric.adoptionPct).slice(0, 3)
  const mcps = dashboard.rankings.mcps.entries.flatMap(entry => {
    const metric = entry.windows['7d']
    return metric ? [{ entry, metric }] : []
  }).sort((left, right) => right.metric.adoptionPct - left.metric.adoptionPct).slice(0, 3)

  return (
    <div className={styles.terminalShell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand} aria-label="Pollen home">
          <span className={styles.brandMark}>P</span><strong>Pollen</strong>
        </Link>

        <nav className={styles.nav} aria-label="Dashboard sections">
          <Link href={scopedHref('/dashboard')} className={styles.navActive} aria-label="Market overview"><span><DashboardIcon name="market" /></span>Overview</Link>
          <Link href={scopedHref('/dashboard/models')} aria-label="Model rankings"><span><DashboardIcon name="models" /></span>Models</Link>
          <Link href={scopedHref('/dashboard/mcps')} aria-label="MCP rankings"><span><DashboardIcon name="tools" /></span>MCPs</Link>
          <Link href={scopedHref('/dashboard/tools')} aria-label="Tool rankings"><span><DashboardIcon name="tools" /></span>Tools</Link>
          <Link href={scopedHref('/dashboard/workflows')} aria-label="Workflow rankings"><span><DashboardIcon name="workflow" /></span>Workflows</Link>
          <Link href={scopedHref('/dashboard/intents')} aria-label="Intent rankings"><span><DashboardIcon name="intent" /></span>Intents</Link>
        </nav>

      </aside>

      <main className={styles.main}>
        <header className={styles.mobileTopbar}>
          <Link href={scopedHref('/dashboard')} className={styles.mobileBrand} aria-label="Pollen dashboard"><span className={styles.brandMark}>P</span><strong>Pollen</strong></Link>
        </header>

        <section className={styles.pageHeader}>
          <h1>Agent Market Index</h1>
          <div className={styles.headerActions}>
            <DashboardScopeSwitch dashboard={dashboard} path="/dashboard" />
            <span className={styles.scopeBadge}>{contributorLabel}</span>
          </div>
        </section>

        {isPersonal && earnings ? <ContributorEarningsSummary earnings={earnings} /> : null}

        {dashboard.status === 'live' ? <div className={styles.dashboardGrid}>
          <section id="models" className={`${styles.panel} ${styles.modelPanel}`}>
            <PanelTitle icon="models" title={isPersonal ? 'Model usage' : 'Model adoption'} href={scopedHref('/dashboard/models')} />
            <div className={styles.tableScroll}>
              <table className={styles.dataTable}>
                <thead><tr><th>#</th><th>Model</th><th>{isPersonal ? 'Share' : 'Adoption'}</th>{isPersonal ? null : <th>Users</th>}{hasModelTokens ? <th>Tokens</th> : null}<th>Sessions</th><th>{isPersonal ? 'Tool success' : 'Completion'}</th></tr></thead>
                <tbody>
                  {models.map(({ entry, metric }, index) => (
                    <tr key={entry.id}>
                      <td className={styles.rank}>{index + 1}</td>
                      <td><div className={styles.entity}><EntityIcon id={entry.id} provider={entry.secondary} /><span><strong>{entry.label}</strong><small>{entry.secondary}</small></span></div></td>
                      <td><div className={styles.metricBar}><strong>{metric.adoptionPct}%</strong><span><i style={{ width: `${metric.adoptionPct}%` }} /></span></div></td>
                      {isPersonal ? null : <td className={styles.mono}>{metric.contributors}/{metric.eligibleContributors}</td>}
                      {hasModelTokens ? <td className={styles.mono} title={`${number.format(metric.totalTokens ?? 0)} tokens across ${metric.tokenizedSessions ?? 0}/${metric.volume} sessions`}>{metric.totalTokens == null ? '—' : compactNumber.format(metric.totalTokens)}</td> : null}
                      <td className={styles.mono}>{metric.volume}</td>
                      <td><span className={styles.score}>{metric.completionPct}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside id="tools" className={`${styles.panel} ${styles.toolPanel}`}>
            <PanelTitle icon="tools" title="Top tools" href={scopedHref('/dashboard/tools')} />
            <div className={styles.compactRows}>
              {tools.map(({ entry, metric }, index) => (
                <div className={styles.toolRow} key={entry.id}>
                  <span className={styles.rank}>{index + 1}</span>
                  <EntityIcon id={entry.iconId ?? entry.id} />
                  <span className={styles.toolName}><strong>{entry.label}</strong><small>{entry.secondary}</small></span>
                  <span className={styles.toolCalls} title={(metric.tokenizedEvents ?? 0) > 0 ? `${number.format(metric.volume)} attributed tokens across ${number.format(metric.calls ?? 0)} calls` : undefined}><strong>{(metric.tokenizedEvents ?? 0) > 0 ? compactNumber.format(metric.volume) : number.format(metric.volume)}</strong><small>{(metric.tokenizedEvents ?? 0) > 0 ? 'tokens' : 'calls'}</small></span>
                  <span className={styles.toolAdoption}>{metric.adoptionPct}%</span>
                </div>
              ))}
            </div>
            <PanelTitle icon="tools" title="Top MCPs" href={scopedHref('/dashboard/mcps')} />
            <div className={styles.compactRows}>
              {mcps.map(({ entry, metric }, index) => (
                <div className={styles.toolRow} key={entry.id}>
                  <span className={styles.rank}>{index + 1}</span>
                  <EntityIcon id={entry.iconId ?? entry.id} />
                  <span className={styles.toolName}><strong>{entry.label}</strong><small>{entry.secondary}</small></span>
                  <span className={styles.toolCalls} title={(metric.tokenizedEvents ?? 0) > 0 ? `${number.format(metric.volume)} attributed tokens across ${number.format(metric.calls ?? 0)} calls` : undefined}><strong>{(metric.tokenizedEvents ?? 0) > 0 ? compactNumber.format(metric.volume) : number.format(metric.volume)}</strong><small>{(metric.tokenizedEvents ?? 0) > 0 ? 'tokens' : 'calls'}</small></span>
                  <span className={styles.toolAdoption}>{metric.adoptionPct}%</span>
                </div>
              ))}
            </div>
          </aside>

          <section className={`${styles.panel} ${styles.moversPanel}`}>
            <PanelTitle icon="market" title={isPersonal ? 'Activity shifts · 7D' : 'Fastest movers · 24H'} />
            <div className={styles.moversTable}>
              <div className={styles.moversHead}><span>Entity</span><span>Market</span><span>{isPersonal ? 'Usage share' : 'Panel reach'}</span><span>{isPersonal ? 'Tool success' : 'Completion'}</span><span>{isPersonal ? '7D change' : '24H change'}</span></div>
              {movers.map(({ section, entry, metric }) => (
                <Link href={dashboardHref(`/dashboard/${section.id}`, dashboard.scope, moverWindow)} className={styles.moverRow} key={`${section.id}-${entry.id}`}>
                  <span className={styles.moverEntity}><EntityIcon id={entry.iconId ?? entry.id} provider={entry.secondary} section={section.id} /><span><strong>{entry.label}</strong><small>{entry.secondary}</small></span></span>
                  <span className={styles.marketType}><DashboardIcon name={section.icon} size={11} />{section.label}</span>
                  <span className={styles.moverReach}><strong>{metric.adoptionPct}%</strong><i><b style={{ width: `${metric.adoptionPct}%` }} /></i></span>
                  <span className={styles.moverCompletion}>{metric.completionPct}%</span>
                  <span className={metric.trendPct != null && metric.trendPct < 0 ? styles.moverDecline : styles.moverChange}>{metric.trendPct == null ? '—' : `${metric.trendPct >= 0 ? '+' : ''}${metric.trendPct}%`} <DashboardIcon name="external" size={10} /></span>
                </Link>
              ))}
            </div>
          </section>
        </div> : (
          <section className={styles.networkState}>
            <span>{isPersonal ? 'LOCAL DATA' : dashboard.status === 'unavailable' ? 'NETWORK UNAVAILABLE' : 'NETWORK WARMING UP'}</span>
            <h2>{isPersonal ? 'No activity in this window.' : dashboard.status === 'unavailable' ? 'Live rankings are temporarily unavailable.' : 'No public rankings yet.'}</h2>
            <p>{isPersonal ? 'Use Codex or Claude Code, then refresh.' : dashboard.status === 'unavailable' ? 'Try again shortly.' : `Rankings publish when at least ${dashboard.kAnonymity} contributors qualify.`}</p>
            {isPersonal ? null : <Link href="/docs/quickstart">Join the network <DashboardIcon name="external" size={12} /></Link>}
          </section>
        )}
      </main>
    </div>
  )
}
