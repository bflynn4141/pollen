import Link from 'next/link'
import type { DashboardScope, NetworkDashboard, RankingWindow } from '@/lib/network-dashboard'
import styles from './dashboard.module.css'

interface DashboardScopeSwitchProps {
  dashboard: NetworkDashboard
  path: string
  window?: RankingWindow
}

const labels: Record<DashboardScope, string> = {
  personal: 'My activity',
  network: 'Network',
}

export function dashboardHref(
  path: string,
  scope: DashboardScope,
  window?: RankingWindow,
): string {
  const params = new URLSearchParams({ scope })
  if (window) params.set('window', window)
  return `${path}?${params.toString()}`
}

export function DashboardScopeSwitch({ dashboard, path, window }: DashboardScopeSwitchProps) {
  if (dashboard.availableScopes.length < 2) return null

  return (
    <nav className={styles.scopeSwitch} aria-label="Dashboard scope">
      {dashboard.availableScopes.map(scope => (
        <Link
          key={scope}
          href={dashboardHref(path, scope, window)}
          className={dashboard.scope === scope ? styles.scopeActive : undefined}
          aria-current={dashboard.scope === scope ? 'page' : undefined}
        >
          {labels[scope]}
        </Link>
      ))}
    </nav>
  )
}
