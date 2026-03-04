'use client'

import { useIsMobile } from '@/lib/hooks'

const STEPS = [
  {
    num: 1,
    title: 'Install',
    code: 'npx prompt-trends-mcp',
    body: 'One command adds the MCP server to your Claude config. No API keys, no signup.',
  },
  {
    num: 2,
    title: 'Code normally',
    code: null,
    body: 'The MCP extracts a session intent, logs which tools and CLI commands you use, and records your model choice. No prompts, no code, no context ever leaves your machine.',
  },
  {
    num: 3,
    title: 'Earn tokens',
    code: null,
    body: 'Revenue from dataset queries flows proportionally to all token holders on Base. More sessions = bigger share.',
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
