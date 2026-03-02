const STEPS = [
  {
    num: '1',
    title: 'Install',
    body: 'One command adds the MCP server to your Claude Code config. No code changes, no SDK — just a background observer.',
  },
  {
    num: '2',
    title: 'Code normally',
    body: 'The MCP extracts a session topic, tool calls used, and commands run. Everything is anonymized locally before upload.',
  },
  {
    num: '3',
    title: 'Earn tokens',
    body: 'Revenue from dataset queries is distributed proportionally to contributors. Tokens vest on Base and are fully transferable.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: '80px 80px' }}>
      <p
        className="text-[12px] font-semibold tracking-[0.14em]"
        style={{ color: 'var(--color-brand)' }}
      >
        HOW IT WORKS
      </p>
      <h2 className="mt-4 font-[family-name:var(--font-grotesk)] text-[36px] font-bold leading-tight tracking-[-0.02em] text-text">
        Three steps. Five minutes.
      </h2>

      <div className="mt-10 grid grid-cols-3 gap-6">
        {STEPS.map(step => (
          <div
            key={step.num}
            className="rounded-xl border bg-white p-8"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {/* Badge */}
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[15px] font-bold text-white"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              {step.num}
            </div>
            <h3 className="mt-5 font-[family-name:var(--font-grotesk)] text-[20px] font-bold text-text">
              {step.title}
            </h3>
            <p
              className="mt-3 text-[14px] leading-[1.6]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
