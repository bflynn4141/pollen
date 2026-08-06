'use client'

import { useIsMobile } from '@/lib/hooks'

const USE_CASES = [
  {
    icon: '\u2261',
    title: 'Market Intelligence',
    desc: 'Track what developers are building in real-time across 12,000+ sessions.',
  },
  {
    icon: '\u2298',
    title: 'Competitive Analysis',
    desc: 'Monitor emerging tools, frameworks, and protocols before they trend.',
  },
  {
    icon: '\u2191',
    title: 'Product Research',
    desc: 'Validate demand before you build. See what developers actually search for.',
  },
  {
    icon: '\u2261',
    title: 'Content Strategy',
    desc: 'Create content developers actually search for. Data-driven editorial planning.',
  },
]

const REQUEST_CODE = `curl https://api.pollen.id/v1/topics \\
  -H "X-402-Payment: <payment-proof>" \\
  -d '{"period": "7d", "limit": 10}'

# Also available: /v1/tools, /v1/commands, /v1/models`

const RESPONSE_CODE = `{
  "topics": [
    { "name": "epstein files",
      "volume": 2847, "trend": "+342%" },
    { "name": "polymarket",
      "volume": 2291, "trend": "+89%" },
    { "name": "mcp server",
      "volume": 1834, "trend": "+156%" }
  ],
  "period": "7d",
  "total_sessions": 12847,
  "cost": "$0.001"
}`

export function ForDevelopers() {
  const isMobile = useIsMobile()

  return (
    <section
      id="for-developers"
      style={{
        backgroundColor: 'var(--bg-primary)',
        padding: isMobile ? '48px 20px' : '80px 48px',
      }}
    >
      <div style={{ maxWidth: 1184, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: isMobile ? 'left' : 'center', marginBottom: isMobile ? 32 : 48 }}>
          <p style={labelStyle}>FOR DEVELOPERS</p>
          <h2
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              fontSize: isMobile ? 28 : 36,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: '#1A1A1A',
              marginBottom: 16,
            }}
          >
            Query real-time developer intelligence.
          </h2>
          <p
            style={{
              fontSize: isMobile ? 15 : 16,
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              maxWidth: 680,
              margin: isMobile ? undefined : '0 auto',
            }}
          >
            REST API access to the world&apos;s largest anonymized dataset of developer topics, tool
            usage, command patterns, and model preferences. Pay per query via x402 — no API
            keys, no signup. All revenue flows on-chain directly to token holders.
          </p>
        </div>

        {/* Content grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            gap: isMobile ? 32 : 48,
            alignItems: 'start',
          }}
        >
          {/* Code blocks */}
          <div
            style={{
              backgroundColor: '#1A1816',
              borderRadius: 12,
              padding: isMobile ? 20 : 28,
              border: '1px solid #3A3632',
              overflowX: 'auto',
            }}
          >
            <p style={codeLabelStyle}>REQUEST</p>
            <pre style={{ ...preStyle, fontSize: isMobile ? 11 : 12.5 }}>{REQUEST_CODE}</pre>
            <p style={{ ...codeLabelStyle, marginTop: isMobile ? 20 : 28 }}>RESPONSE</p>
            <pre style={{ ...preStyle, fontSize: isMobile ? 11 : 12.5 }}>{RESPONSE_CODE}</pre>
          </div>

          {/* Use cases */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 20 : 28, paddingTop: isMobile ? 0 : 8 }}>
            {USE_CASES.map((uc) => (
              <div key={uc.title} style={{ display: 'flex', gap: 16, alignItems: 'start' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    backgroundColor: '#FDF0EB',
                    color: 'var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {uc.icon}
                </div>
                <div>
                  <h4
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      marginBottom: 4,
                    }}
                  >
                    {uc.title}
                  </h4>
                  <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    {uc.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isMobile ? 12 : 20,
            marginTop: isMobile ? 32 : 48,
          }}
        >
          <a
            href="/docs/developers/trends-api"
            style={{
              padding: '12px 28px',
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--accent)',
              border: '1.5px solid var(--accent)',
              borderRadius: 8,
              textDecoration: 'none',
              backgroundColor: 'transparent',
            }}
          >
            View API Docs
          </a>
          <p style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--text-muted)', textAlign: 'center' }}>
            Pay per query via x402. No API keys. Revenue flows directly to contributors.
          </p>
        </div>
      </div>
    </section>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.12em',
  color: 'var(--accent)',
  marginBottom: 16,
}

const codeLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: '#6B6560',
  marginBottom: 12,
}

const preStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12.5,
  lineHeight: 1.7,
  color: '#C8C4BF',
  whiteSpace: 'pre-wrap',
  margin: 0,
}
