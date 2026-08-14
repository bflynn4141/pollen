import Link from 'next/link'
import { listReceiptWeeks, readReceiptNetwork } from '@pollen/data'
import { DashboardIcon } from '../dashboard/dashboard-icons'
import styles from '../dashboard/dashboard.module.css'

export const dynamic = 'force-dynamic'

const number = new Intl.NumberFormat('en-US')
const percent = (rate: number) => `${Math.round(rate * 100)}%`
const title = (value: string) => value
  .replaceAll('_', ' ')
  .replace(/\b\w/g, character => character.toUpperCase())

export default async function NetworkPage() {
  const [week] = await listReceiptWeeks()
  const network = week ? await readReceiptNetwork(week) : null

  return (
    <div className={styles.terminalShell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand} aria-label="Pollen home">
          <span className={styles.brandMark}>P</span><strong>Pollen</strong>
        </Link>
        <nav className={styles.nav} aria-label="Network sections">
          <Link href="/network" className={styles.navActive}><span><DashboardIcon name="market" /></span>Live network</Link>
          <Link href="/dashboard"><span><DashboardIcon name="models" /></span>Demo index</Link>
          <Link href="/docs/quickstart"><span><DashboardIcon name="external" /></span>Join Pollen</Link>
        </nav>
      </aside>

      <main className={styles.main}>
        <header className={styles.mobileTopbar}>
          <Link href="/network" className={styles.mobileBrand} aria-label="Pollen live network"><span className={styles.brandMark}>P</span><strong>Pollen</strong></Link>
        </header>
        <section className={styles.pageHeader}>
          <h1>Live agent network</h1>
          <span>{week ?? 'K≥5'}</span>
        </section>

        {network ? (
          <>
            <section className={styles.marketBar}>
              <div className={styles.marketIdentity}>
                <span className={styles.marketIcon}>P</span>
                <div><h1>Privacy-safe production activity</h1><p>Closed receipts · {network.period} · no prompts or source code</p></div>
              </div>
              <div className={styles.marketMetric}><small>Contributors</small><strong>{network.overview.contributors}</strong><span>qualified panel</span></div>
              <div className={styles.marketMetric}><small>Sessions</small><strong>{number.format(network.overview.sessions)}</strong><span>closed receipts</span></div>
              <div className={styles.marketMetric}><small>Completion</small><strong>{percent(network.overview.completionRate)}</strong><span>observed terminal state</span></div>
              <div className={styles.marketMetric}><small>Checks passed</small><strong>{percent(network.overview.checkPassRate)}</strong><span>all receipt outcomes</span></div>
            </section>

            <div className={styles.dashboardGrid}>
              <section className={`${styles.panel} ${styles.modelPanel}`}>
                <header className={styles.panelTitle}><div className={styles.panelTitleCopy}><span className={styles.panelGlyph}><DashboardIcon name="models" /></span><h2>Models</h2></div></header>
                <div className={styles.tableScroll}><table className={styles.dataTable}>
                  <thead><tr><th>#</th><th>Model</th><th>Agent</th><th>Contributors</th><th>Sessions</th><th>Completion</th></tr></thead>
                  <tbody>{network.models.map((model, index) => (
                    <tr key={`${model.agent}-${model.model}`}><td className={styles.rank}>{index + 1}</td><td><div className={styles.entity}><span className={styles.entityIcon}>{model.model.slice(0, 1).toUpperCase()}</span><span><strong>{model.model}</strong><small>production receipt</small></span></div></td><td>{model.agent}</td><td className={styles.mono}>{model.contributors}</td><td className={styles.mono}>{model.sessions}</td><td><span className={styles.score}>{percent(model.completionRate)}</span></td></tr>
                  ))}</tbody>
                </table></div>
              </section>

              <aside className={`${styles.panel} ${styles.toolPanel}`}>
                <header className={styles.panelTitle}><div className={styles.panelTitleCopy}><span className={styles.panelGlyph}><DashboardIcon name="tools" /></span><h2>Tool categories</h2></div></header>
                <div className={styles.compactRows}>{network.toolCategories.map((category, index) => (
                  <div className={styles.toolRow} key={category.category}><span className={styles.rank}>{index + 1}</span><span className={styles.entityIcon}>{category.category.slice(0, 1).toUpperCase()}</span><span className={styles.toolName}><strong>{title(category.category)}</strong><small>{category.contributors} contributors</small></span><span className={styles.toolCalls}><strong>{number.format(category.events)}</strong><small>events</small></span><span className={styles.toolAdoption}>{category.sessions}</span></div>
                ))}</div>
              </aside>

              <section className={`${styles.panel} ${styles.moversPanel}`}>
                <header className={styles.panelTitle}><div className={styles.panelTitleCopy}><span className={styles.panelGlyph}><DashboardIcon name="intent" /></span><h2>Intent outcomes</h2></div></header>
                <div className={styles.tableScroll}><table className={styles.dataTable}>
                  <thead><tr><th>#</th><th>Intent</th><th>Contributors</th><th>Sessions</th><th>Completion</th><th>Checks passed</th></tr></thead>
                  <tbody>{network.intents.map((intent, index) => (
                    <tr key={intent.intent}><td className={styles.rank}>{index + 1}</td><td><strong>{title(intent.intent)}</strong></td><td className={styles.mono}>{intent.contributors}</td><td className={styles.mono}>{intent.sessions}</td><td><span className={styles.score}>{percent(intent.completionRate)}</span></td><td>{percent(intent.checkPassRate)}</td></tr>
                  ))}</tbody>
                </table></div>
              </section>

              <section className={`${styles.panel} ${styles.workflowPanel}`}>
                <header className={styles.panelTitle}><div className={styles.panelTitleCopy}><span className={styles.panelGlyph}><DashboardIcon name="workflow" /></span><h2>Observed workflows</h2></div></header>
                <div className={styles.tableScroll}><table className={`${styles.dataTable} ${styles.workflowTable}`}>
                  <thead><tr><th>#</th><th>Sequence</th><th>Contributors</th><th>Sessions</th><th>Completion</th><th>Checks passed</th></tr></thead>
                  <tbody>{network.workflows.map((workflow, index) => (
                    <tr key={workflow.sequence.join('>')}><td className={styles.rank}>{index + 1}</td><td><div className={styles.sequence}>{workflow.sequence.map((step, stepIndex) => <span key={`${step}-${stepIndex}`}>{title(step)}{stepIndex < workflow.sequence.length - 1 ? <i>→</i> : null}</span>)}</div></td><td className={styles.mono}>{workflow.contributors}</td><td className={styles.mono}>{workflow.sessions}</td><td><span className={styles.score}>{percent(workflow.completionRate)}</span></td><td>{percent(workflow.checkPassRate)}</td></tr>
                  ))}</tbody>
                </table></div>
              </section>
            </div>
          </>
        ) : (
          <div className={styles.dashboardGrid}>
            <section className={styles.destination}>
              <div><span>COLLECTION IS LIVE</span><h2>The founding panel is warming up.</h2></div>
              <div className={styles.destinationModules}><span><i>01</i> Closed receipts only</span><span><i>02</i> Five-contributor threshold</span><span><i>03</i> Automatic publication</span></div>
              <Link href="/docs/quickstart">Join the network <DashboardIcon name="external" size={12} /></Link>
            </section>
            <section className={`${styles.panel} ${styles.moversPanel}`}>
              <header className={styles.panelTitle}><div className={styles.panelTitleCopy}><span className={styles.panelGlyph}><DashboardIcon name="market" /></span><h2>Why no chart yet?</h2></div></header>
              <div className={styles.insight}><strong>Pollen will publish the first live weekly snapshot only after at least five distinct contributors qualify for the same aggregate.</strong><p>This prevents one person’s activity from being inferred. The ingestion service is accepting production receipts now; the rollup job will expose only cells that pass that boundary.</p></div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
