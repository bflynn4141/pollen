import type { Metadata } from 'next'
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' })
const grotesk = Space_Grotesk({ subsets: ['latin'], display: 'swap', variable: '--font-grotesk' })
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'Prompt Trends — Claude Code Usage Intelligence',
  description: 'Dashboard for Claude Code usage patterns across topics, tools, and sessions.',
}

export default function TrendsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${grotesk.variable} ${mono.variable} min-h-screen font-[family-name:var(--font-inter)]`}>
      {children}
    </div>
  )
}
