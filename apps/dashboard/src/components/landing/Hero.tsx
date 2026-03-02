export default function Hero() {
  return (
    <section className="relative overflow-hidden" style={{ padding: '100px 80px 80px' }}>
      {/* Watercolor gradient background — full-bleed, no hard edge */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: 'rgba(198, 106, 59, 0.025)',
          background: [
            'radial-gradient(ellipse 120% 80% at 60% 30%, rgba(198, 106, 59, 0.05), transparent 70%)',
            'radial-gradient(ellipse 80% 60% at 20% 70%, rgba(198, 106, 59, 0.03), transparent 70%)',
            'radial-gradient(ellipse 60% 50% at 85% 60%, rgba(95, 125, 133, 0.025), transparent 70%)',
          ].join(', '),
        }}
      />

      <div className="relative max-w-[640px]">
        {/* Eyebrow */}
        <p
          className="text-[12px] font-medium tracking-[0.14em]"
          style={{ color: 'var(--color-brand)' }}
        >
          THE SHARED INTELLIGENCE NETWORK
        </p>

        {/* Headline */}
        <h1
          className="mt-5 font-[family-name:var(--font-grotesk)] text-[56px] font-bold leading-[1.08] tracking-[-0.03em] text-text"
        >
          Your prompts have value.
          <br />
          Now earn from them.
        </h1>

        {/* Body */}
        <p
          className="mt-6 max-w-[560px] text-[18px] leading-[1.6]"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          Install one MCP server. Your Claude Code sessions are anonymized, structured,
          and contributed to a shared dataset. Query revenue flows back to you as tokens.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex items-center gap-4">
          <a
            href="#how-it-works"
            className="inline-flex items-center rounded-lg px-6 py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            Start Contributing
          </a>
          <div
            className="inline-flex items-center rounded-lg px-5 py-3 font-[family-name:var(--font-mono)] text-[13px] font-medium text-[#E0DBD5]"
            style={{ backgroundColor: '#1A1A1A' }}
          >
            <span className="mr-2 text-[#666]">$</span>
            npx prompt-trends-mcp
          </div>
        </div>

        {/* Social proof */}
        <p className="mt-6 text-[13px]" style={{ color: '#A09A94' }}>
          10,983 sessions contributed&ensp;·&ensp;$210,102 earned
        </p>
      </div>
    </section>
  )
}
