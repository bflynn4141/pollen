interface StatCard {
  label: string
  value: string
  subtitle: string
  variant?: 'default' | 'featured'
}

export default function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className="grid grid-cols-3 gap-5">
      {cards.map((card, i) => {
        const featured = card.variant === 'featured'
        return (
          <div
            key={i}
            className="rounded-xl px-7 py-6"
            style={{
              background: featured ? 'var(--card-dark)' : 'var(--card-bg)',
              border: featured ? 'none' : '1px solid var(--card-border)',
            }}
          >
            <p
              className="text-xs font-medium uppercase tracking-[0.06em]"
              style={{ color: featured ? 'rgba(250,250,248,0.5)' : 'var(--text-muted)' }}
            >
              {card.label}
            </p>
            <p
              className="mt-2 font-[family-name:var(--font-mono)] text-[44px] font-bold leading-none tracking-[-0.03em]"
              style={{ color: featured ? 'var(--accent)' : 'var(--text)' }}
            >
              {card.value}
            </p>
            <p
              className="mt-2 text-[13px]"
              style={{ color: featured ? 'rgba(250,250,248,0.5)' : 'var(--text-muted)' }}
            >
              {card.subtitle}
            </p>
          </div>
        )
      })}
    </div>
  )
}
