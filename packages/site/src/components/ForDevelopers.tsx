'use client'

import { useIsMobile } from '@/lib/hooks'

const USE_CASES = [
  {
    icon: '\u2261',
    title: 'Market Intelligence',
    desc: 'Track privacy-qualified changes in models, intents, tools, and workflows.',
  },
  {
    icon: '\u2298',
    title: 'Competitive Analysis',
    desc: 'Compare published adoption and outcome patterns without exposing individual sessions.',
  },
  {
    icon: '\u2191',
    title: 'Product Research',
    desc: 'Use contributor-backed aggregate signals as one input to product decisions.',
  },
  {
    icon: '\u2261',
    title: 'Agent Evaluation',
    desc: 'Study tool-category sequences and observable outcomes across privacy-safe cohorts.',
  },
]

const REQUEST_CODE = `# Inspect the product before paying
curl https://pollen-api.bflynn4141.workers.dev/catalog

# Paid route: first request returns x402 v2
curl -i https://pollen-api.bflynn4141.workers.dev/grid`

const RESPONSE_CODE = `{
  "x402Version": 2,
  "resource": { "url": ".../grid" },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "amount": "50000"
  }]
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
            Query privacy-safe, contributor-backed aggregates through a documented REST API.
            Inspect free previews and the machine-readable catalog first, then pay per published
            result with x402 v2 and USDC on Base. No API key is required for reads.
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
            V2 currently rewards all holders. The approved, not-yet-live V3 path rewards recent verified contributors who held POLLEN.
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
