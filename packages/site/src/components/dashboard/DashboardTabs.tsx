'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/trends/topics', label: 'Topics' },
  { href: '/trends/tools', label: 'Tool Calls' },
  { href: '/trends/commands', label: 'Commands' },
  { href: '/trends/models', label: 'Models' },
]

export default function DashboardTabs() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-6">
      {TABS.map(tab => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="pb-2 text-[13px] transition-colors"
            style={{
              fontWeight: active ? 600 : 500,
              color: active ? 'var(--text)' : 'var(--tab-inactive)',
              borderBottom: active ? '2px solid var(--tab-active-border)' : '2px solid transparent',
            }}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
