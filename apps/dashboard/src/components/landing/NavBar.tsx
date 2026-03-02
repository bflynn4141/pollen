'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const NAV_LINKS = [
  { href: '/topics', label: 'Dashboard' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#for-developers', label: 'For Developers' },
]

export default function NavBar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className="sticky top-0 z-50 flex h-[74px] items-center justify-between transition-colors duration-200"
      style={{
        padding: '20px 80px',
        backgroundColor: scrolled ? 'rgba(247, 245, 242, 0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--color-border)' : '1px solid transparent',
      }}
    >
      {/* Logo */}
      <Link
        href="/"
        className="font-[family-name:var(--font-grotesk)] text-[20px] font-bold text-text"
      >
        Prompt Trends
      </Link>

      {/* Center links */}
      <div className="flex items-center gap-8">
        {NAV_LINKS.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className="text-[14px] transition-colors hover:text-text"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* GitHub pill */}
      <a
        href="https://github.com/pollen-labs/prompt-trends"
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-[20px] border px-4 py-[6px] text-[13px] font-medium transition-colors hover:bg-[#0000000a]"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text-secondary)',
        }}
      >
        View on GitHub
      </a>
    </nav>
  )
}
