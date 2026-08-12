import Link from 'next/link'
import { DEMO_NETWORK_SNAPSHOT as network } from '@/data/demo-network'
import { DEMO_RANKINGS, type RankingSection } from '@/data/demo-rankings'
import {
  DashboardIcon,
  EntityMark,
  type DashboardIconName,
} from './dashboard-icons'
import styles from './dashboard.module.css'

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

export default function DashboardPage() {
  const sections: Array<{ id: RankingSection; label: string; icon: DashboardIconName }> = [
    { id: 'models', label: 'Models', icon: 'models' },
    { id: 'tools', label: 'Tools', icon: 'tools' },
    { id: 'workflows', label: 'Workflows', icon: 'workflow' },
    { id: 'intents', label: 'Intents', icon: 'intent' },
  ]
  const movers = sections
    .flatMap(section => DEMO_RANKINGS[section.id].entries.map(entry => ({ section, entry, metric: entry.windows['24h'] })))
    .sort((left, right) => right.metric.trendPct - left.metric.trendPct)
    .slice(0, 6)

  return (
    <div className={styles.terminalShell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand} aria-label="Pollen home">
          <span className={styles.brandMark}>P</span><strong>Pollen</strong>
        </Link>

        <nav className={styles.nav} aria-label="Dashboard sections">
          <Link href="/dashboard" className={styles.navActive} aria-label="Market overview"><span><DashboardIcon name="market" /></span>Overview</Link>
          <Link href="/dashboard/models" aria-label="Model rankings"><span><DashboardIcon name="models" /></span>Models</Link>
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
          <span>7D</span>
        </section>

        <div className={styles.dashboardGrid}>
          <section id="models" className={`${styles.panel} ${styles.modelPanel}`}>
            <PanelTitle icon="models" title="Model adoption" href="/dashboard/models" />
            <div className={styles.tableScroll}>
              <table className={styles.dataTable}>
                <thead><tr><th>#</th><th>Model</th><th>Adoption</th><th>Users</th><th>Sessions</th><th>Completion</th></tr></thead>
                <tbody>
                  {network.models.map((model, index) => (
                    <tr key={model.id}>
                      <td className={styles.rank}>{index + 1}</td>
                      <td><div className={styles.entity}><EntityIcon id={model.id} provider={model.provider} /><span><strong>{model.label}</strong><small>{model.provider}</small></span></div></td>
                      <td><div className={styles.metricBar}><strong>{model.adoptionPct}%</strong><span><i style={{ width: `${model.adoptionPct}%` }} /></span></div></td>
                      <td className={styles.mono}>{model.contributors}/{model.eligibleContributors}</td>
                      <td className={styles.mono}>{model.sessions}</td>
                      <td><span className={styles.score}>{model.completionPct}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside id="tools" className={`${styles.panel} ${styles.toolPanel}`}>
            <PanelTitle icon="tools" title="Top tools" href="/dashboard/tools" />
            <div className={styles.compactRows}>
              {network.tools.map((tool, index) => (
                <div className={styles.toolRow} key={tool.id}>
                  <span className={styles.rank}>{index + 1}</span>
                  <EntityIcon id={tool.id} />
                  <span className={styles.toolName}><strong>{tool.label}</strong><small>{tool.category}</small></span>
                  <span className={styles.toolCalls}><strong>{number.format(tool.calls)}</strong><small>calls</small></span>
                  <span className={styles.toolAdoption}>{tool.adoptionPct}%</span>
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
                  <span className={styles.moverEntity}><EntityIcon id={entry.id} provider={entry.secondary} section={section.id} /><span><strong>{entry.label}</strong><small>{entry.secondary}</small></span></span>
                  <span className={styles.marketType}><DashboardIcon name={section.icon} size={11} />{section.label}</span>
                  <span className={styles.moverReach}><strong>{metric.adoptionPct}%</strong><i><b style={{ width: `${metric.adoptionPct}%` }} /></i></span>
                  <span className={styles.moverCompletion}>{metric.completionPct}%</span>
                  <span className={styles.moverChange}>+{metric.trendPct}% <DashboardIcon name="external" size={10} /></span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
