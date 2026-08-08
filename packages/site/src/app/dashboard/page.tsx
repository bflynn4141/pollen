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

function PanelTitle({ icon, eyebrow, title, meta, href }: { icon: DashboardIconName; eyebrow: string; title: string; meta?: string; href?: string }) {
  return (
    <header className={styles.panelTitle}>
      <div className={styles.panelTitleCopy}>
        <span className={styles.panelGlyph}><DashboardIcon name={icon} /></span>
        <div><small>{eyebrow}</small><h2>{title}</h2></div>
      </div>
      <div className={styles.panelActions}>
        {meta ? <span className={styles.panelMeta}>{meta}</span> : null}
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
        <header className={styles.topbar}>
          <Link href="/" className={styles.mobileBrand} aria-label="Pollen home"><span className={styles.brandMark}>P</span><strong>Pollen</strong></Link>
          <div className={styles.search} aria-label="Search preview">
            <DashboardIcon name="search" size={13} /><span>Search models, tools, workflows…</span><kbd>/</kbd>
          </div>
          <div className={styles.topActions}>
            <span className={styles.snapshotBadge}><i />Founding panel</span>
            <Link href="/docs" className={styles.docsLink}>Methodology <DashboardIcon name="external" size={11} /></Link>
          </div>
        </header>

        <section id="market" className={styles.marketBar} aria-label="Market snapshot">
          <div className={styles.marketIdentity}>
            <span className={styles.marketIcon}>P</span>
            <div><h1>Agent Market Index</h1><p>Synthetic, privacy-thresholded founding snapshot</p></div>
          </div>
          <div className={styles.marketMetric}><small>Sessions</small><strong>{number.format(network.summary.sessions)}</strong><span className={styles.positive}>7D panel</span></div>
          <div className={styles.marketMetric}><small>Tool calls</small><strong>{number.format(network.summary.toolCalls)}</strong><span className={styles.positive}>aggregate</span></div>
          <div className={styles.marketMetric}><small>Contributors</small><strong>{network.summary.contributors}</strong><span>frozen</span></div>
          <div className={styles.marketMetric}><small>Published</small><strong>{network.summary.publishedCells}</strong><span>{network.summary.suppressedCells} suppressed</span></div>
          <div className={styles.windowMetric}><small>Observation window</small><strong>{network.period.start} → {network.period.end}</strong><span>{network.period.timezone} · 7D</span></div>
        </section>

        <div className={styles.filterBar} aria-label="Current dashboard view">
          <div className={styles.tabs}><span className={styles.tabActive}>Overview</span><Link href="/dashboard/models">Models</Link><Link href="/dashboard/tools">Tools</Link><Link href="/dashboard/workflows">Workflows</Link><Link href="/dashboard/intents">Intents</Link></div>
          <div className={styles.filterMeta}><span>Rank by <strong>Adoption ↓</strong></span><span>Window <strong>7D</strong></span><span className={styles.synthetic}>● SYNTHETIC DATA</span></div>
        </div>

        <div className={styles.dashboardGrid}>
          <section id="models" className={`${styles.panel} ${styles.modelPanel}`}>
            <PanelTitle icon="models" eyebrow="Live index" title="Model adoption" meta={`${network.panel.eligibleContributors} eligible contributors`} href="/dashboard/models" />
            <div className={styles.tableScroll}>
              <table className={styles.dataTable}>
                <thead><tr><th>#</th><th>Model</th><th>Adoption</th><th>Users</th><th>Sessions</th><th>Completion</th><th>Signal</th></tr></thead>
                <tbody>
                  {network.models.map((model, index) => (
                    <tr key={model.id}>
                      <td className={styles.rank}>{index + 1}</td>
                      <td><div className={styles.entity}><EntityIcon id={model.id} provider={model.provider} /><span><strong>{model.label}</strong><small>{model.provider}</small></span></div></td>
                      <td><div className={styles.metricBar}><strong>{model.adoptionPct}%</strong><span><i style={{ width: `${model.adoptionPct}%` }} /></span></div></td>
                      <td className={styles.mono}>{model.contributors}/{model.eligibleContributors}</td>
                      <td className={styles.mono}>{model.sessions}</td>
                      <td><span className={styles.score}>{model.completionPct}%</span></td>
                      <td><span className={index === 0 ? styles.trendUp : styles.trendFlat}>{index === 0 ? '◆ leader' : '◇ observed'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside id="tools" className={`${styles.panel} ${styles.toolPanel}`}>
            <PanelTitle icon="tools" eyebrow="Agent behavior" title="Top tools" meta="by adoption" href="/dashboard/tools" />
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

          <nav className={styles.exploreStrip} aria-label="Expanded ranking pages">
            {sections.map(section => (
              <Link key={section.id} href={`/dashboard/${section.id}`}>
                <span><DashboardIcon name={section.icon} /></span>
                <strong>{section.label} rankings</strong>
                <DashboardIcon name="external" size={11} />
              </Link>
            ))}
          </nav>

          <section className={`${styles.panel} ${styles.moversPanel}`}>
            <PanelTitle icon="market" eyebrow="Across the index" title="Fastest movers" meta="24H change" />
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
