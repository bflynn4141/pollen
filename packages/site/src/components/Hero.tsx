'use client'

import { PollenCanvas } from './PollenCanvas'
import { useIsMobile } from '@/lib/hooks'

export function Hero() {
  const isMobile = useIsMobile()

  return (
    <section
      style={{
        position: 'relative',
        padding: isMobile ? '48px 20px 32px' : '80px 48px 48px',
        maxWidth: 1280,
        margin: '0 auto',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: 'center',
        gap: isMobile ? 24 : 48,
      }}
    >
      {/* Left: text content */}
      <div style={{ flex: '3 1 0%', maxWidth: 640 }}>
        <p
          style={{
            fontSize: isMobile ? 11 : 13,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase' as const,
            color: 'var(--accent)',
            marginBottom: isMobile ? 16 : 24,
          }}
        >
          THE SHARED INTELLIGENCE NETWORK
        </p>

        <h1
          style={{
            fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
            fontSize: isMobile ? 36 : 56,
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: '#1A1A1A',
            marginBottom: isMobile ? 16 : 24,
          }}
        >
          Your prompts have value.
          <br />
          Now earn from them.
        </h1>

        <p
          style={{
            fontSize: isMobile ? 15 : 17,
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            marginBottom: isMobile ? 24 : 36,
            maxWidth: 520,
          }}
        >
          One MCP server turns your anonymized coding patterns into a shared
          dataset. Every time it gets queried, you earn — proportional
          to what you contributed.
        </p>

        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center',
            gap: isMobile ? 12 : 16,
            marginBottom: isMobile ? 20 : 32,
          }}
        >
          <a
            href="#get-started"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '14px 24px' : '12px 28px',
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              backgroundColor: 'var(--accent)',
              borderRadius: 8,
              textDecoration: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Start Contributing
          </a>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '12px 20px' : '12px 24px',
              fontSize: isMobile ? 13 : 14,
              fontFamily: 'monospace',
              color: '#E8E4DF',
              backgroundColor: 'var(--text-primary)',
              borderRadius: 8,
              gap: 8,
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>$</span>
            npx prompt-trends-mcp
          </div>
        </div>

        <p style={{ fontSize: isMobile ? 13 : 14, color: 'var(--text-muted)' }}>
          12,847 sessions contributed&nbsp;&nbsp;·&nbsp;&nbsp;$210,102 earned by contributors
        </p>
      </div>

      {/* Right: particle animation (desktop only) */}
      {!isMobile && (
        <div
          style={{
            flex: '2 1 0%',
            position: 'relative',
            minHeight: 480,
            width: '100%',
          }}
        >
          <PollenCanvas />
        </div>
      )}
    </section>
  )
}
