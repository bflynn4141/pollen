export default function FinalCTA() {
  return (
    <section className="relative overflow-hidden" style={{ padding: '80px 80px' }}>
      {/* Subtle watercolor background — full-bleed */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundColor: 'rgba(198, 106, 59, 0.02)',
          background: [
            'radial-gradient(ellipse 100% 80% at 30% 50%, rgba(198, 106, 59, 0.04), transparent 70%)',
            'radial-gradient(ellipse 80% 70% at 70% 40%, rgba(95, 125, 133, 0.03), transparent 70%)',
          ].join(', '),
        }}
      />

      <div className="relative text-center">
        <h2 className="font-[family-name:var(--font-grotesk)] text-[40px] font-bold leading-tight tracking-[-0.02em] text-text">
          Start earning from your sessions.
        </h2>

        <div className="mt-8 flex items-center justify-center gap-4">
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
      </div>
    </section>
  )
}
