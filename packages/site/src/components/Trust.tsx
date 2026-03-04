'use client'

import { useIsMobile } from '@/lib/hooks'

const PILLARS = [
  {
    icon: '\u2606',
    title: 'Local extraction',
    body: 'All extraction runs on your machine. Only anonymized labels leave \u2014 intent, tool names, command categories, model choice. Never code, prompts, or file contents.',
  },
  {
    icon: '\uD83D\uDD12',
    title: 'On-chain ownership',
    body: 'Your contribution is represented by tokens on Base. Verifiable, transferable, yours.',
  },
  {
    icon: '\u25CE',
    title: 'Fully transparent',
    body: 'Open-source MCP server. Public dataset. Query revenue and distributions visible on-chain.',
  },
]

export function Trust() {
  const isMobile = useIsMobile()

  return (
    <section
      style={{
        backgroundColor: 'var(--bg-primary)',
        padding: isMobile ? '48px 20px' : '80px 48px',
      }}
    >
      <div style={{ maxWidth: 1184, margin: '0 auto' }}>
        <h2
          style={{
            fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
            fontSize: isMobile ? 28 : 36,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: '#1A1A1A',
            textAlign: isMobile ? 'left' : 'center',
            marginBottom: isMobile ? 28 : 48,
          }}
        >
          Built by developers, for developers.
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: isMobile ? 16 : 24,
          }}
        >
          {PILLARS.map((p) => (
            <div
              key={p.title}
              style={{
                backgroundColor: '#fff',
                borderRadius: 12,
                padding: isMobile ? 24 : 32,
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  color: 'var(--accent)',
                  marginBottom: 20,
                }}
              >
                {p.icon}
              </div>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 12,
                }}
              >
                {p.title}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                }}
              >
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
