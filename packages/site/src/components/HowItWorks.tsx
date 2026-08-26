'use client'

import { useIsMobile } from '@/lib/hooks'

const STEPS = [
  {
    num: 1,
    title: 'Install',
    code: 'pollen setup --agents',
    body: 'One command installs local hooks for supported coding agents. Founding-panel access requires an invite.',
  },
  {
    num: 2,
    title: 'Code normally',
    code: null,
    body: 'Local hooks produce a closed receipt with coarse intent, agent and model, tool categories, public MCP identifiers, and outcome buckets. Prompt text, code, paths, arguments, results, and shell output stay local.',
  },
  {
    num: 3,
    title: 'Build the network',
    code: null,
    body: 'Privacy-qualified receipts can contribute to weekly POLLEN scores. V2 currently rewards all holders; the approved, not-yet-live V3 path uses recent activity plus a POLLEN snapshot.',
  },
]

export function HowItWorks() {
  const isMobile = useIsMobile()

  return (
    <section
      style={{
        backgroundColor: 'var(--bg-primary)',
        padding: isMobile ? '48px 20px' : '80px 48px',
      }}
    >
      <div style={{ maxWidth: 1184, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: isMobile ? 'left' : 'center', marginBottom: isMobile ? 32 : 56 }}>
          <p style={labelStyle}>HOW IT WORKS</p>
          <h2
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              fontSize: isMobile ? 28 : 36,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: '#1A1A1A',
            }}
          >
            Three steps. Five minutes.
          </h2>
        </div>

        {/* Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: isMobile ? 16 : 24,
          }}
        >
          {STEPS.map((step) => (
            <div
              key={step.num}
              style={{
                backgroundColor: '#fff',
                borderRadius: 12,
                padding: isMobile ? 24 : 32,
              }}
            >
              {/* Number badge */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  backgroundColor: 'var(--accent)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 700,
                  marginBottom: 20,
                }}
              >
                {step.num}
              </div>

              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  marginBottom: 16,
                }}
              >
                {step.title}
              </h3>

              {step.code && (
                <div
                  style={{
                    display: 'inline-block',
                    padding: '10px 20px',
                    fontSize: 13,
                    fontFamily: 'monospace',
                    color: '#E8E4DF',
                    backgroundColor: 'var(--text-primary)',
                    borderRadius: 6,
                    marginBottom: 16,
                  }}
                >
                  {step.code}
                </div>
              )}

              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: 'var(--text-secondary)',
                }}
              >
                {step.body}
              </p>
            </div>
          ))}
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
