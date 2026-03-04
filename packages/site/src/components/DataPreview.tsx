'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useIsMobile, useReducedMotion } from '@/lib/hooks'

type Tab = 'intents' | 'tools' | 'commands' | 'models'

const TABS: { key: Tab; label: string }[] = [
  { key: 'intents', label: 'Intents' },
  { key: 'tools', label: 'Tool Calls' },
  { key: 'commands', label: 'Commands' },
  { key: 'models', label: 'Models' },
]

/* ── Per-tab bar colors (from Paper designs) ──── */
const TAB_COLORS: Record<Tab, string> = {
  intents: '#C45D3E',  // copper
  tools: '#5C8F8A',    // teal
  commands: '#3D6B4F',  // forest green
  models: '#6B5B8D',   // deep purple
}

// Mock data per tab — ranked items with counts
const TAB_DATA: Record<Tab, { items: { label: string; count: number }[]; rising: { label: string; pct: number }[] }> = {
  intents: {
    items: [
      { label: 'code-generation', count: 5_102 },
      { label: 'debugging', count: 4_231 },
      { label: 'refactoring', count: 3_688 },
      { label: 'code-review', count: 2_547 },
      { label: 'documentation', count: 1_932 },
      { label: 'testing', count: 1_410 },
    ],
    rising: [
      { label: 'infrastructure', pct: 389 },
      { label: 'security-audit', pct: 264 },
      { label: 'data-pipeline', pct: 198 },
      { label: 'accessibility', pct: 155 },
    ],
  },
  tools: {
    items: [
      { label: 'figma·get_design_context', count: 4_291 },
      { label: 'github·create_pr', count: 3_847 },
      { label: 'postgres·query', count: 2_901 },
      { label: 'stripe·create_payment', count: 2_103 },
      { label: 'slack·send_message', count: 1_847 },
      { label: 'vercel·deploy', count: 1_202 },
    ],
    rising: [
      { label: 'linear·create_issue', pct: 412 },
      { label: 'anthropic·create_message', pct: 287 },
      { label: 'supabase·query', pct: 195 },
      { label: 'cloudflare·deploy_worker', pct: 156 },
    ],
  },
  commands: {
    items: [
      { label: 'git commit', count: 6_102 },
      { label: 'npm install', count: 4_523 },
      { label: 'git push', count: 3_891 },
      { label: 'docker build', count: 2_310 },
      { label: 'pnpm test', count: 1_988 },
      { label: 'curl', count: 1_445 },
    ],
    rising: [
      { label: 'bun run', pct: 523 },
      { label: 'wrangler deploy', pct: 312 },
      { label: 'turbo build', pct: 201 },
      { label: 'vitest', pct: 178 },
    ],
  },
  models: {
    items: [
      { label: 'claude-sonnet-4', count: 8_210 },
      { label: 'claude-opus-4', count: 5_401 },
      { label: 'claude-haiku-4', count: 3_220 },
      { label: 'gpt-4o', count: 2_150 },
      { label: 'claude-sonnet-3.5', count: 1_890 },
      { label: 'gemini-2.0-flash', count: 1_102 },
    ],
    rising: [
      { label: 'claude-opus-4', pct: 445 },
      { label: 'gemini-2.5-pro', pct: 298 },
      { label: 'deepseek-r1', pct: 210 },
      { label: 'grok-3', pct: 162 },
    ],
  },
}

// Header labels per tab
const HEADER_LABELS: Record<Tab, string> = {
  intents: 'TOP INTENTS — LAST 7 DAYS',
  tools: 'TOP MCP TOOLS — LAST 7 DAYS',
  commands: 'TOP COMMANDS — LAST 7 DAYS',
  models: 'TOP MODELS — LAST 7 DAYS',
}

export function DataPreview() {
  const [active, setActive] = useState<Tab>('intents')
  const [animKey, setAnimKey] = useState(0)
  const data = TAB_DATA[active]
  const maxCount = data.items[0]?.count ?? 1
  const barColor = TAB_COLORS[active]
  const isMobile = useIsMobile()
  const reducedMotion = useReducedMotion()

  const handleTabChange = useCallback((tab: Tab) => {
    if (tab === active) return
    setActive(tab)
    setAnimKey((k) => k + 1)
  }, [active])

  return (
    <section
      style={{
        maxWidth: 1184,
        margin: '0 auto 80px',
        padding: isMobile ? '0 20px' : '0 48px',
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--border)',
            padding: isMobile ? '0 12px' : '0 32px',
            overflowX: isMobile ? 'auto' : undefined,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              style={{
                padding: isMobile ? '14px 14px' : '16px 20px',
                fontSize: isMobile ? 13 : 14,
                fontWeight: active === tab.key ? 600 : 400,
                color: active === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                borderBottom: active === tab.key ? `2px solid ${barColor}` : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'color 0.2s, border-color 0.2s',
              }}
            >
              {tab.label}
            </button>
          ))}

          {/* Dashboard link — pushed to right */}
          <a
            href="/trends"
            style={{
              marginLeft: 'auto',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-muted)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              padding: '16px 0',
              display: isMobile ? 'none' : 'block',
            }}
          >
            View Dashboard →
          </a>
        </div>

        {/* Content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 340px',
            gap: 0,
            padding: isMobile ? '20px' : '32px',
          }}
        >
          {/* Left — bar chart */}
          <div key={animKey}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
                marginBottom: isMobile ? 16 : 24,
              }}
            >
              {HEADER_LABELS[active]}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 16 }}>
              {data.items.map((item, i) => (
                <AnimatedRow
                  key={`${animKey}-${item.label}`}
                  item={item}
                  maxCount={maxCount}
                  barColor={barColor}
                  index={i}
                  isMobile={isMobile}
                  skipAnimation={reducedMotion}
                />
              ))}
            </div>
          </div>

          {/* Right — rising fast (hidden on mobile) */}
          {!isMobile && (
            <div key={`rising-${animKey}`} style={{ borderLeft: '1px solid var(--border)', paddingLeft: 32 }}>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  color: 'var(--text-muted)',
                  marginBottom: 24,
                }}
              >
                RISING FAST
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.rising.map((item, i) => (
                  <RisingCard
                    key={`${animKey}-${item.label}`}
                    item={item}
                    index={i}
                    accentColor={barColor}
                    skipAnimation={reducedMotion}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/* ── Animated bar row ─────────────────────────── */

function AnimatedRow({
  item,
  maxCount,
  barColor,
  index,
  isMobile,
  skipAnimation,
}: {
  item: { label: string; count: number }
  maxCount: number
  barColor: string
  index: number
  isMobile: boolean
  skipAnimation: boolean
}) {
  const targetWidth = (item.count / maxCount) * 100
  const [width, setWidth] = useState(skipAnimation ? targetWidth : 0)
  const [opacity, setOpacity] = useState(skipAnimation ? 1 : 0)

  useEffect(() => {
    if (skipAnimation) {
      setWidth(targetWidth)
      setOpacity(1)
      return
    }
    // staggered delay: each row starts 50ms after the previous
    const delay = index * 50
    const timer = setTimeout(() => {
      setWidth(targetWidth)
      setOpacity(1)
    }, delay)
    return () => clearTimeout(timer)
  }, [targetWidth, index, skipAnimation])

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '120px 1fr 56px' : '200px 1fr 64px',
        alignItems: 'center',
        gap: isMobile ? 10 : 16,
        opacity,
        transform: skipAnimation ? undefined : `translateX(${opacity === 0 ? -8 : 0}px)`,
        transition: 'opacity 0.35s ease-out, transform 0.35s ease-out',
      }}
    >
      <span
        style={{
          fontSize: isMobile ? 12 : 14,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {formatLabel(item.label)}
      </span>
      <div
        style={{
          height: isMobile ? 20 : 24,
          borderRadius: 4,
          backgroundColor: barColor,
          width: `${width}%`,
          minWidth: 4,
          transition: 'width 0.5s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.3s',
        }}
      />
      <span
        style={{
          fontSize: isMobile ? 12 : 14,
          color: 'var(--text-secondary)',
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {item.count.toLocaleString()}
      </span>
    </div>
  )
}

/* ── Animated rising card ─────────────────────── */

function RisingCard({
  item,
  index,
  accentColor,
  skipAnimation,
}: {
  item: { label: string; pct: number }
  index: number
  accentColor: string
  skipAnimation: boolean
}) {
  const [opacity, setOpacity] = useState(skipAnimation ? 1 : 0)

  useEffect(() => {
    if (skipAnimation) { setOpacity(1); return }
    const timer = setTimeout(() => setOpacity(1), 150 + index * 60)
    return () => clearTimeout(timer)
  }, [index, skipAnimation])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'var(--bg-primary)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        opacity,
        transform: skipAnimation ? undefined : `translateY(${opacity === 0 ? 6 : 0}px)`,
        transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
      }}
    >
      <div>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          {formatLabel(item.label)}
        </span>
        <p style={{ fontSize: 12, color: accentColor, marginTop: 2 }}>
          +{item.pct}% this week
        </p>
      </div>
      <span style={{ fontSize: 16, color: accentColor }}>↗</span>
    </div>
  )
}

/** Bold the part after the separator (· or space for commands) */
function formatLabel(label: string): React.ReactNode {
  const sep = label.indexOf('·')
  if (sep !== -1) {
    return (
      <>
        <span style={{ color: 'var(--text-muted)' }}>{label.slice(0, sep + 1)}</span>
        <strong>{label.slice(sep + 1)}</strong>
      </>
    )
  }
  return label
}
