import Link from 'next/link'
import {
  fetchNetworkDashboard,
  type RankingSection,
} from '@/lib/network-dashboard'
import {
  DashboardIcon,
  EntityMark,
  type DashboardIconName,
} from './dashboard-icons'
import styles from './dashboard.module.css'

export const revalidate = 300

const number = new Intl.NumberFormat('en-US')
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

export default async function DashboardPage() {
  const dashboard = await fetchNetworkDashboard()
  const sections: Array<{ id: RankingSection; label: string; icon: DashboardIconName }> = [
    { id: 'models', label: 'Models', icon: 'models' },
    { id: 'mcps', label: 'MCPs', icon: 'tools' },
    { id: 'tools', label: 'Tools', icon: 'tools' },
    { id: 'workflows', label: 'Workflows', icon: 'workflow' },
    { id: 'intents', label: 'Intents', icon: 'intent' },
  ]
  const movers = sections
    .flatMap(section => dashboard.rankings[section.id].entries.flatMap(entry => {
      const metric = entry.windows['24h']
      return metric ? [{ section, entry, metric }] : []
    }))
    .filter(item => item.metric.trendPct !== null)
    .sort((left, right) => (right.metric.trendPct ?? 0) - (left.metric.trendPct ?? 0))
    .slice(0, 6)
  const models = dashboard.rankings.models.entries.flatMap(entry => {
    const metric = entry.windows['7d']
    return metric ? [{ entry, metric }] : []
  }).sort((left, right) => right.metric.adoptionPct - left.metric.adoptionPct).slice(0, 6)
  const tools = dashboard.rankings.tools.entries.flatMap(entry => {
    const metric = entry.windows['7d']
    return metric ? [{ entry, metric }] : []
  }).sort((left, right) => right.metric.adoptionPct - left.metric.adoptionPct).slice(0, 6)

  return (
    <div className={styles.terminalShell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand} aria-label="Pollen home">
          <span className={styles.brandMark}>P</span><strong>Pollen</strong>
        </Link>

        <nav className={styles.nav} aria-label="Dashboard sections">
          <Link href="/network" aria-label="Live production network"><span><DashboardIcon name="market" /></span>Live network</Link>
          <Link href="/dashboard" className={styles.navActive} aria-label="Market overview"><span><DashboardIcon name="market" /></span>Overview</Link>
          <Link href="/dashboard/models" aria-label="Model rankings"><span><DashboardIcon name="models" /></span>Models</Link>
          <Link href="/dashboard/mcps" aria-label="MCP rankings"><span><DashboardIcon name="tools" /></span>MCPs</Link>
          <Link href="/dashboard/tools" aria-label="Tool rankings"><span><DashboardIcon name="tools" /></span>Tools</Link>
          <Link href="/dashboard/workflows" aria-label="Workflow rankings"><span><DashboardIcon name="workflow" /></span>Workflows</Link>
          <Link href="/dashboard/intents" aria-label="Intent rankings"><span><DashboardIcon name="intent" /></span>Intents</Link>
        </nav>

      </aside>

      <main className={styles.main}>
        <header className={styles.mobileTopbar}>
          <Link href="/dashboard" className={styles.mobileBrand} aria-label="Pollen dashboard"><span className={styles.brandMark}>P</span><strong>Pollen</strong></Link>
        </header>

        <section className={styles.pageHeader}>
          <h1>Agent Market Index</h1>
          <span>{dashboard.status === 'live' ? 'LIVE' : `K≥${dashboard.kAnonymity}`}</span>
        </section>

        {dashboard.status === 'live' ? <div className={styles.dashboardGrid}>
          <section id="models" className={`${styles.panel} ${styles.modelPanel}`}>
            <PanelTitle icon="models" title="Model adoption" href="/dashboard/models" />
            <div className={styles.tableScroll}>
              <table className={styles.dataTable}>
                <thead><tr><th>#</th><th>Model</th><th>Adoption</th><th>Users</th><th>Sessions</th><th>Completion</th></tr></thead>
                <tbody>
                  {models.map(({ entry, metric }, index) => (
                    <tr key={entry.id}>
                      <td className={styles.rank}>{index + 1}</td>
                      <td><div className={styles.entity}><EntityIcon id={entry.id} provider={entry.secondary} /><span><strong>{entry.label}</strong><small>{entry.secondary}</small></span></div></td>
                      <td><div className={styles.metricBar}><strong>{metric.adoptionPct}%</strong><span><i style={{ width: `${metric.adoptionPct}%` }} /></span></div></td>
                      <td className={styles.mono}>{metric.contributors}/{metric.eligibleContributors}</td>
                      <td className={styles.mono}>{metric.volume}</td>
                      <td><span className={styles.score}>{metric.completionPct}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside id="tools" className={`${styles.panel} ${styles.toolPanel}`}>
            <PanelTitle icon="tools" title="Top tools" href="/dashboard/tools" />
            <div className={styles.compactRows}>
              {tools.map(({ entry, metric }, index) => (
                <div className={styles.toolRow} key={entry.id}>
                  <span className={styles.rank}>{index + 1}</span>
                  <EntityIcon id={entry.iconId ?? entry.id} />
                  <span className={styles.toolName}><strong>{entry.label}</strong><small>{entry.secondary}</small></span>
                  <span className={styles.toolCalls}><strong>{number.format(metric.volume)}</strong><small>calls</small></span>
                  <span className={styles.toolAdoption}>{metric.adoptionPct}%</span>
                </div>
              ))}
            </div>
          </aside>

          <section className={`${styles.panel} ${styles.moversPanel}`}>
            <PanelTitle icon="market" title="Fastest movers · 24H" />
            <div className={styles.moversTable}>
              <div className={styles.moversHead}><span>Entity</span><span>Market</span><span>Panel reach</span><span>Completion</span><span>24H change</span></div>
              {movers.map(({ section, entry, metric }) => (
                <Link href={`/dashboard/${section.id}?window=24h`} className={styles.moverRow} key={`${section.id}-${entry.id}`}>
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
            <span>{dashboard.status === 'unavailable' ? 'NETWORK UNAVAILABLE' : 'NETWORK WARMING UP'}</span>
            <h2>{dashboard.status === 'unavailable' ? 'Live rankings are temporarily unavailable.' : 'No public rankings yet.'}</h2>
            <p>{dashboard.status === 'unavailable' ? 'Try again shortly.' : `Rankings publish when at least ${dashboard.kAnonymity} contributors qualify.`}</p>
            <Link href="/docs/quickstart">Join the network <DashboardIcon name="external" size={12} /></Link>
          </section>
        )}
      </main>
    </div>
  )
}
