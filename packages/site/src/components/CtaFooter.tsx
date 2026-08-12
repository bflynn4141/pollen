'use client'

import { useIsMobile } from '@/lib/hooks'

export function CtaFooter() {
  const isMobile = useIsMobile()

  return (
    <>
      {/* Final CTA */}
      <section
        style={{
          backgroundColor: '#1A1A1A',
          padding: isMobile ? '48px 20px' : '80px 48px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Radial glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: isMobile ? 350 : 600,
            height: isMobile ? 250 : 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(196,93,62,0.15) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <h2
          style={{
            fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
            fontSize: isMobile ? 28 : 40,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: '#FAF8F5',
            marginBottom: isMobile ? 24 : 36,
            position: 'relative',
          }}
        >
          Start earning from your sessions.
        </h2>

        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isMobile ? 12 : 16,
            position: 'relative',
          }}
        >
          <a
            href="#get-started"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '14px 28px' : '14px 32px',
              fontSize: 16,
              fontWeight: 600,
              color: '#fff',
              backgroundColor: 'var(--accent)',
              borderRadius: 8,
              textDecoration: 'none',
              border: 'none',
              width: isMobile ? '100%' : undefined,
            }}
          >
            Start Contributing
          </a>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '12px 24px' : '14px 28px',
              fontSize: 14,
              fontFamily: 'monospace',
              color: '#6B6560',
              backgroundColor: '#FAF8F5',
              borderRadius: 8,
              gap: 8,
              width: isMobile ? '100%' : undefined,
            }}
          >
            <span style={{ color: '#9B9590' }}>$</span>
            npx @pollen/cli setup
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          backgroundColor: '#1A1A1A',
          padding: isMobile ? '24px 20px 32px' : '32px 48px 40px',
          textAlign: 'center',
          borderTop: '1px solid #333',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: isMobile ? 20 : 32,
            marginBottom: 16,
          }}
        >
          {['GitHub', 'API Docs', 'How It Works', 'x402 Protocol'].map((link) => (
            <a
              key={link}
              href="#"
              style={{
                fontSize: 14,
                color: '#6B6560',
                textDecoration: 'none',
              }}
            >
              {link}
            </a>
          ))}
        </div>
        <p style={{ fontSize: 13, color: '#4A4540' }}>
          Built for Claude Code. Powered by Base.
        </p>
      </footer>
    </>
  )
}
