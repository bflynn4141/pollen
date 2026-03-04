'use client'

import { usePathname } from 'next/navigation'
import { useIsMobile } from '@/lib/hooks'

export function NavBar() {
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const onDashboard = pathname.startsWith('/trends/')

  return (
    <nav
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '16px 20px' : '20px 48px',
        maxWidth: 1280,
        margin: '0 auto',
      }}
    >
      <a
        href="/"
        style={{
          fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif',
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: '#1A1A1A',
          textDecoration: 'none',
        }}
      >
        Prompt Trends
      </a>

      {isMobile ? (
        <a
          href="/docs"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--accent)',
            textDecoration: 'none',
            padding: '6px 14px',
            borderRadius: 20,
            border: '1px solid var(--accent)',
          }}
        >
          Docs
        </a>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a
            href="/trends/topics"
            style={{
              ...linkStyle,
              fontWeight: onDashboard ? 600 : 500,
              color: onDashboard ? '#1A1A1A' : 'var(--text-secondary)',
            }}
          >
            Dashboard
          </a>
          <a href={onDashboard ? '/#how-it-works' : '#how-it-works'} style={linkStyle}>
            How It Works
          </a>
          <a
            href="/docs"
            style={{
              ...linkStyle,
              fontWeight: pathname.startsWith('/docs') ? 600 : 500,
              color: pathname.startsWith('/docs') ? '#1A1A1A' : 'var(--accent)',
            }}
          >
            Docs
          </a>
          <a
            href="https://github.com/bflynn4141/pollen"
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...linkStyle, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <GitHubIcon />
            View on GitHub
          </a>
        </div>
      )}
    </nav>
  )
}

const linkStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  textDecoration: 'none',
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}
