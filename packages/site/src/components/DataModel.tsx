'use client'

import { useIsMobile } from '@/lib/hooks'

const CATEGORIES = [
  {
    color: '#C45D3E',
    title: 'SESSION INTENTS',
    desc: 'What developers are building and thinking about',
  },
  {
    color: '#5C9E8F',
    title: 'MCP TOOL CALLS',
    desc: 'Which servers and tools get called during sessions',
  },
  {
    color: '#C45D3E',
    title: 'COMMANDS & MODELS',
    desc: 'CLI command categories and which AI model was chosen',
  },
]

const TERMINAL_LINES = [
  { type: 'cmd', text: '$ claude "add auth to the Next.js app"' },
  { type: 'highlight', text: '  Topic: nextjs-authentication' },
  { type: 'blank', text: '' },
  { type: 'tool', text: '  → figma · get_screenshot' },
  { type: 'tool', text: '  → github · create_pr' },
  { type: 'blank', text: '' },
  { type: 'cmd', text: '$ git commit -m "add auth middleware"' },
  { type: 'cmd', text: '$ npm run test' },
  { type: 'blank', text: '' },
  { type: 'model', text: '  Model: claude-sonnet-4.5' },
]

export function DataModel() {
  const isMobile = useIsMobile()

  return (
    <section
      style={{
        backgroundColor: 'var(--bg-primary)',
        padding: isMobile ? '48px 20px' : '80px 48px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ maxWidth: 1184, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: isMobile ? 'left' : 'center', marginBottom: isMobile ? 32 : 56 }}>
          <p style={labelStyle}>THE DATASET</p>
          <h2
            style={{
              fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
              fontSize: isMobile ? 28 : 36,
              fontWeight: 700,
              letterSpacing: '-0.03em',
              color: '#1A1A1A',
            }}
          >
            What we actually collect.
          </h2>
        </div>

        {/* Content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 380px',
            gap: isMobile ? 32 : 64,
            alignItems: 'start',
          }}
        >
          {/* Terminal */}
          <div
            style={{
              backgroundColor: '#1A1816',
              borderRadius: 12,
              padding: isMobile ? 20 : 28,
              border: '1px solid #3A3632',
            }}
          >
            {/* Traffic lights */}
            <div style={{ display: 'flex', gap: 8, marginBottom: isMobile ? 16 : 24 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FF5F57' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FEBC2E' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#28C840' }} />
            </div>

            {/* Lines */}
            <div style={{ fontFamily: 'monospace', fontSize: isMobile ? 12 : 13, lineHeight: 1.8 }}>
              {TERMINAL_LINES.map((line, i) => {
                if (line.type === 'blank') return <div key={i} style={{ height: 8 }} />
                let color = '#9B9590'
                let borderColor = 'transparent'
                if (line.type === 'highlight') { color = '#C45D3E'; borderColor = '#C45D3E' }
                if (line.type === 'tool') { color = '#5C9E8F'; borderColor = '#5C9E8F' }
                if (line.type === 'cmd') { borderColor = '#5C9E8F' }
                if (line.type === 'model') { color = '#8B7EC8'; borderColor = '#8B7EC8' }
                return (
                  <div
                    key={i}
                    style={{
                      color,
                      borderLeft: `3px solid ${borderColor}`,
                      paddingLeft: borderColor !== 'transparent' ? 12 : 15,
                    }}
                  >
                    {line.text}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Categories */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 24 : 32, paddingTop: isMobile ? 0 : 16 }}>
            {CATEGORIES.map((cat) => (
              <div
                key={cat.title}
                style={{
                  borderLeft: `3px solid ${cat.color}`,
                  paddingLeft: 20,
                }}
              >
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: cat.color,
                    marginBottom: 8,
                  }}
                >
                  {cat.title}
                </p>
                <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {cat.desc}
                </p>
              </div>
            ))}
          </div>
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
