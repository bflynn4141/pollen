const USE_CASES = [
  {
    title: 'Market Intelligence',
    body: 'Which frameworks are developers actually adopting? Track real usage, not GitHub stars.',
  },
  {
    title: 'Competitive Analysis',
    body: 'See which tools and MCP servers gain traction week-over-week across thousands of sessions.',
  },
  {
    title: 'Product Research',
    body: 'Understand what developers build, what commands they run, and where they get stuck.',
  },
  {
    title: 'Content Strategy',
    body: 'Find trending topics before they peak. Create tutorials for what developers actually need.',
  },
]

export default function ForDevelopers() {
  return (
    <section
      id="for-developers"
      className="border-t"
      style={{
        backgroundColor: 'var(--color-dev-bg)',
        borderColor: 'var(--color-border)',
        padding: '80px 80px',
      }}
    >
      <p
        className="text-[12px] font-semibold tracking-[0.14em]"
        style={{ color: 'var(--color-brand)' }}
      >
        FOR DEVELOPERS
      </p>
      <h2 className="mt-4 font-[family-name:var(--font-grotesk)] text-[36px] font-bold leading-tight tracking-[-0.02em] text-text">
        Query the dataset. Build with it.
      </h2>
      <p
        className="mt-3 max-w-[520px] text-[16px] leading-[1.6]"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Access structured developer intelligence through a simple API. Pay per query with x402 — no API keys, no signup.
      </p>

      <div className="mt-10 grid grid-cols-2 gap-8">
        {/* Left: Terminal */}
        <div
          className="overflow-hidden rounded-xl font-[family-name:var(--font-mono)] text-[13px] leading-[1.8]"
          style={{ backgroundColor: '#1A1A1A', padding: '28px' }}
        >
          <div>
            <span style={{ color: 'var(--color-terminal-dim)' }}>$ </span>
            <span style={{ color: 'var(--color-terminal-tool)' }}>curl</span>
            <span style={{ color: '#A09A94' }}> -X GET \</span>
          </div>
          <div>
            <span style={{ color: '#A09A94' }}>  &quot;https://api.pollen.id/intents?period=7d&quot;</span>
          </div>
          <div className="mt-4" style={{ color: 'var(--color-terminal-dim)' }}>
            {'// Response (x402 payment: $0.001)'}
          </div>
          <div style={{ color: '#D4D0CC' }}>{'{'}</div>
          <div style={{ color: '#D4D0CC' }}>
            {'  '}<span style={{ color: 'var(--color-brand)' }}>&quot;intents&quot;</span>{': ['}
          </div>
          <div style={{ color: '#D4D0CC' }}>
            {'    { '}<span style={{ color: '#A09A94' }}>&quot;name&quot;</span>{': '}<span style={{ color: 'var(--color-terminal-tool)' }}>&quot;Build authentication flow&quot;</span>{','}
          </div>
          <div style={{ color: '#D4D0CC' }}>
            {'      '}<span style={{ color: '#A09A94' }}>&quot;sessions&quot;</span>{': '}<span style={{ color: 'var(--color-terminal-model)' }}>847</span>{','}
          </div>
          <div style={{ color: '#D4D0CC' }}>
            {'      '}<span style={{ color: '#A09A94' }}>&quot;trend&quot;</span>{': '}<span style={{ color: 'var(--color-trend-up)' }}>&quot;up&quot;</span>{' },'}
          </div>
          <div style={{ color: '#D4D0CC' }}>{'    ...'}</div>
          <div style={{ color: '#D4D0CC' }}>{'  ]'}</div>
          <div style={{ color: '#D4D0CC' }}>{'}'}</div>
        </div>

        {/* Right: Use case cards */}
        <div className="grid grid-cols-1 gap-4">
          {USE_CASES.map(uc => (
            <div
              key={uc.title}
              className="rounded-xl border bg-white p-5"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <h3 className="font-[family-name:var(--font-grotesk)] text-[16px] font-bold text-text">
                {uc.title}
              </h3>
              <p
                className="mt-1.5 text-[13px] leading-[1.5]"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                {uc.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* View API Docs button */}
      <div className="mt-10">
        <a
          href="/docs"
          className="inline-flex items-center rounded-lg border px-5 py-2.5 text-[14px] font-medium transition-colors hover:bg-white"
          style={{
            borderColor: 'var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          View API Docs →
        </a>
      </div>
    </section>
  )
}
