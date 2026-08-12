import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  DEMO_RANKINGS,
  RANKING_WINDOWS,
  type RankingEntry,
  type RankingSection,
  type RankingWindow,
} from '@/data/demo-rankings'
import { DashboardIcon, EntityMark, type DashboardIconName } from '../dashboard-icons'
import home from '../dashboard.module.css'
import styles from './ranking-page.module.css'

const number = new Intl.NumberFormat('en-US')
const sections: RankingSection[] = ['models', 'tools', 'workflows', 'intents']
const sectionIcons: Record<RankingSection, DashboardIconName> = {
  models: 'models',
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
  const definition = DEMO_RANKINGS[section as RankingSection]
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
  const values = RANKING_WINDOWS.map(item => entry.windows[item.id].adoptionPct)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values.map((value, index) => `${4 + index * 22},${18 - ((value - min) / range) * 13}`).join(' ')

  return (
    <svg className={styles.sparkline} viewBox="0 0 52 22" aria-label={`Adoption trend: ${values.join('%, ')}%`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.split(' ').map((point, index) => {
        const [cx, cy] = point.split(',')
        return <circle key={RANKING_WINDOWS[index].id} cx={cx} cy={cy} r="1.8" fill="currentColor" />
      })}
    </svg>
  )
}

export default async function RankingPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>
  searchParams: Promise<{ window?: string | string[] }>
}) {
  const [{ section }, query] = await Promise.all([params, searchParams])
  if (!sections.includes(section as RankingSection)) notFound()

  const activeSection = section as RankingSection
  const selectedWindow: RankingWindow = isRankingWindow(query.window) ? query.window : '7d'
  const definition = DEMO_RANKINGS[activeSection]
  const icon = sectionIcons[activeSection]
  const ranked = [...definition.entries].sort((left, right) => right.windows[selectedWindow].adoptionPct - left.windows[selectedWindow].adoptionPct)
  const totalVolume = ranked.reduce((sum, entry) => sum + entry.windows[selectedWindow].volume, 0)
  const topMover = [...ranked].sort((left, right) => right.windows[selectedWindow].trendPct - left.windows[selectedWindow].trendPct)[0]
  const mostReliable = [...ranked].sort((left, right) => right.windows[selectedWindow].completionPct - left.windows[selectedWindow].completionPct)[0]

  return (
    <div className={home.terminalShell}>
      <aside className={home.sidebar}>
        <Link href="/" className={home.brand} aria-label="Pollen home"><span className={home.brandMark}>P</span><strong>Pollen</strong></Link>
        <nav className={home.nav} aria-label="Dashboard pages">
          <Link href="/dashboard" aria-label="Overview"><span><DashboardIcon name="market" /></span>Overview</Link>
          {sections.map(item => (
            <Link key={item} href={`/dashboard/${item}`} className={item === activeSection ? home.navActive : undefined} aria-label={DEMO_RANKINGS[item].label}>
              <span><DashboardIcon name={sectionIcons[item]} /></span>{DEMO_RANKINGS[item].label.replace(' rankings', '')}
            </Link>
          ))}
        </nav>
      </aside>

      <main className={home.main}>
        <header className={home.mobileTopbar}>
          <Link href="/dashboard" className={home.mobileBrand} aria-label="Pollen dashboard"><span className={home.brandMark}>P</span><strong>Pollen</strong></Link>
        </header>

        <section className={styles.rankingHeader}>
          <div className={styles.titleRow}>
            <div className={styles.titleCopy}><span className={styles.titleIcon}><DashboardIcon name={icon} size={20} /></span><h1>{definition.label}</h1></div>
            <nav className={styles.windowToggle} aria-label="Ranking interval">
              {RANKING_WINDOWS.map(item => <Link key={item.id} href={`/dashboard/${activeSection}?window=${item.id}`} className={item.id === selectedWindow ? styles.windowActive : undefined} aria-current={item.id === selectedWindow ? 'page' : undefined}>{item.label}</Link>)}
            </nav>
          </div>
          <div className={styles.summaryStrip}>
            <div><small>{definition.volumeLabel}</small><strong>{number.format(totalVolume)}</strong></div>
            <div><small>Top mover</small><strong className={styles.summaryEntity}>{topMover.label}</strong><span className={styles.up}>+{topMover.windows[selectedWindow].trendPct}%</span></div>
            <div><small>Best completion</small><strong className={styles.summaryEntity}>{mostReliable.label}</strong><span>{mostReliable.windows[selectedWindow].completionPct}%</span></div>
          </div>
        </section>

        <div className={styles.contentGrid}>
          <section className={styles.rankingPanel}>
            <div className={styles.tableScroll}>
              <table className={styles.rankingTable}>
                <thead><tr><th>#</th><th>{definition.singular}</th>{activeSection === 'workflows' ? <th>Sequence</th> : null}<th>{definition.adoptionLabel}</th><th>Users</th><th>{definition.volumeLabel}</th><th>Completion</th><th>Trend</th><th>Δ prev.</th></tr></thead>
                <tbody>
                  {ranked.map((entry, index) => {
                    const value = entry.windows[selectedWindow]
                    return (
                      <tr key={entry.id}>
                        <td className={styles.rank}>{String(index + 1).padStart(2, '0')}</td>
                        <td><div className={styles.entity}><span className={`${home.entityIcon} ${iconTone(entry)}`}>{activeSection === 'workflows' ? <DashboardIcon name="workflow" /> : <EntityMark id={entry.id} provider={entry.secondary} />}</span><span><strong>{entry.label}</strong><small>{entry.secondary}</small></span></div></td>
                        {activeSection === 'workflows' ? <td><div className={styles.sequence}>{entry.sequence?.map((step, stepIndex) => <span key={step}>{step}{stepIndex < (entry.sequence?.length ?? 0) - 1 ? <i>›</i> : null}</span>)}</div></td> : null}
                        <td><div className={styles.adoption}><strong>{value.adoptionPct}%</strong><span><i style={{ width: `${value.adoptionPct}%` }} /></span></div></td>
                        <td className={styles.mono}>{value.contributors}/{value.eligibleContributors}</td>
                        <td className={styles.mono}>{number.format(value.volume)}</td>
                        <td><span className={styles.score}>{value.completionPct}%</span></td>
                        <td><TrendLine entry={entry} /></td>
                        <td><span className={value.trendPct >= 0 ? styles.changeUp : styles.changeDown}>{value.trendPct >= 0 ? '+' : ''}{value.trendPct}%</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
