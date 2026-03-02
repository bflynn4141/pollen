const CARDS = [
  {
    title: 'Local extraction',
    body: 'Topic classification happens on your machine. Only the structured topic, tool names, and model choice leave your device.',
  },
  {
    title: 'On-chain ownership',
    body: 'Every contribution is recorded on Base. Your tokens represent real, transferable ownership of the dataset you helped build.',
  },
  {
    title: 'Fully transparent',
    body: 'The MCP server is open-source. See exactly what data is collected, how it\'s processed, and where revenue goes.',
  },
]

export default function TrustSection() {
  return (
    <section style={{ padding: '80px 80px' }}>
      <h2 className="font-[family-name:var(--font-grotesk)] text-[36px] font-bold leading-tight tracking-[-0.02em] text-text">
        Built by developers, for developers.
      </h2>

      <div className="mt-10 grid grid-cols-3 gap-6">
        {CARDS.map(card => (
          <div
            key={card.title}
            className="rounded-xl border bg-white p-8"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <h3 className="font-[family-name:var(--font-grotesk)] text-[20px] font-bold text-text">
              {card.title}
            </h3>
            <p
              className="mt-3 text-[14px] leading-[1.6]"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
