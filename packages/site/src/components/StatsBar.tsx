'use client'

import { useIsMobile } from '@/lib/hooks'

const STATS = [
  { value: 'LIVE', label: 'PRODUCTION COLLECTION' },
  { value: 'K = 5', label: 'PUBLIC PRIVACY THRESHOLD' },
  { value: '0', label: 'RAW PROMPTS COLLECTED' },
]

export function StatsBar() {
  const isMobile = useIsMobile()

  return (
    <section
      style={{
        backgroundColor: '#1A1A1A',
        padding: isMobile ? '24px 20px' : '40px 48px',
      }}
    >
      <div
        style={{
          maxWidth: 1184,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          textAlign: 'center',
        }}
      >
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            style={{
              padding: isMobile ? '12px 0' : '16px 0',
              borderLeft: i > 0 ? '1px solid #3A3632' : 'none',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
                fontSize: isMobile ? 22 : 36,
                fontWeight: 700,
                color: '#FAF8F5',
                marginBottom: isMobile ? 4 : 8,
              }}
            >
              {stat.value}
            </p>
            <p
              style={{
                fontSize: isMobile ? 9 : 11,
                fontWeight: 600,
                letterSpacing: '0.12em',
                color: '#6B6560',
              }}
            >
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
