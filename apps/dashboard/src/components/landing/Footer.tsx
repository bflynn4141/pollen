const LINKS = [
  { href: 'https://github.com/pollen-labs/prompt-trends', label: 'GitHub' },
  { href: '/docs', label: 'API Docs' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: 'https://x402.org', label: 'x402 Protocol' },
]

export default function Footer() {
  return (
    <footer
      className="border-t"
      style={{
        borderColor: 'var(--color-border)',
        padding: '40px 80px 60px',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          {LINKS.map(link => (
            <a
              key={link.label}
              href={link.href}
              className="text-[14px] transition-colors hover:text-text"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {link.label}
            </a>
          ))}
        </div>
        <p className="text-[13px]" style={{ color: '#A09A94' }}>
          Built for Claude Code. Powered by Base.
        </p>
      </div>
    </footer>
  )
}
