'use client'

import { useState } from 'react'
import type { RankItem } from '@/lib/types'

const TABS = [
  { key: 'topics', label: 'Intents', heading: 'TRENDING INTENTS', color: 'var(--color-bar-topics)' },
  { key: 'tools', label: 'Tool Calls', heading: 'TOP TOOLS', color: 'var(--color-bar-tools)' },
  { key: 'commands', label: 'Commands', heading: 'TOP COMMANDS', color: 'var(--color-bar-commands)' },
  { key: 'models', label: 'Models', heading: 'MODEL USAGE', color: 'var(--color-bar-models)' },
] as const

type TabKey = (typeof TABS)[number]['key']

interface Props {
  data: Record<TabKey, RankItem[]>
  totalSessions: number
}

export default function LiveDataTabs({ data, totalSessions }: Props) {
  const [active, setActive] = useState<TabKey>('topics')
  const tab = TABS.find(t => t.key === active)!
  const items = data[active].slice(0, 6)
  const maxCount = items.length > 0 ? items[0].count : 1

  const rising = data[active]
    .filter(i => i.trend === 'up' && i.changePercent !== null)
    .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
    .slice(0, 4)

  return (
    <div
      className="mx-auto max-w-[1280px] overflow-hidden rounded-xl border bg-white"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* Tab bar */}
      <div
        className="flex gap-0 border-b"
        style={{ borderColor: 'var(--color-border)' }}
      >
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className="px-6 py-3.5 text-[13px] font-medium transition-colors"
            style={{
              color: t.key === active ? 'var(--color-text)' : 'var(--color-text-secondary)',
              borderBottom: t.key === active ? `2px solid ${t.color}` : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-[1fr_300px]">
        {/* Left: Bar chart */}
        <div className="p-8">
          <p
            className="mb-6 text-[11px] font-semibold tracking-[0.08em]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {tab.heading} — LAST 7 DAYS
          </p>
          <div className="flex flex-col gap-3">
            {items.map(item => (
              <div key={item.name} className="flex items-center gap-3">
                <span className="w-[220px] shrink-0 truncate text-[13px] font-medium text-text">
                  {item.name}
                </span>
                <div className="flex-1 rounded" style={{ height: 24, backgroundColor: '#F0EBE6' }}>
                  <div
                    className="h-full rounded transition-all duration-300"
                    style={{
                      width: `${Math.max((item.count / maxCount) * 100, 3)}%`,
                      backgroundColor: tab.color,
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-[family-name:var(--font-mono)] text-[12px] text-text-count">
                  {item.count.toLocaleString()}
                </span>
              </div>
            ))}
            {items.length === 0 && (
              <p className="py-8 text-center text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                No data for this period
              </p>
            )}
          </div>
        </div>

        {/* Right: Rising fast */}
        <div className="border-l p-8" style={{ borderColor: 'var(--color-border)' }}>
          <p
            className="mb-6 text-[11px] font-semibold tracking-[0.08em]"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            RISING FAST
          </p>
          <div className="flex flex-col gap-5">
            {rising.map(item => (
              <div key={item.name}>
                <p className="text-[14px] font-medium text-text">{item.name}</p>
                <p className="mt-0.5 text-[12px] font-medium" style={{ color: 'var(--color-trend-up)' }}>
                  ↑ {item.changePercent}%
                </p>
              </div>
            ))}
            {rising.length === 0 && (
              <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
                No trending items this week
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Caption */}
      <div
        className="border-t px-8 py-3.5 text-[12px]"
        style={{ borderColor: 'var(--color-border)', color: '#A09A94' }}
      >
        Live data from {totalSessions.toLocaleString()}+ developer sessions
      </div>
    </div>
  )
}
