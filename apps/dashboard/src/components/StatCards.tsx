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
            className={`rounded-xl px-7 py-7 ${
              featured
                ? 'bg-card-dark'
                : 'border border-card-border bg-card'
            }`}
          >
            <p
              className={`text-xs font-medium uppercase tracking-[0.06em] ${
                featured ? 'text-white/50' : 'text-text-muted'
              }`}
            >
              {card.label}
            </p>
            <p
              className={`mt-2 font-[family-name:var(--font-mono)] text-[44px] font-bold leading-none tracking-[-0.03em] ${
                featured ? 'text-accent' : 'text-text'
              }`}
            >
              {card.value}
            </p>
            <p
              className={`mt-2 text-[13px] ${
                featured ? 'text-white/50' : 'text-text-muted'
              }`}
            >
              {card.subtitle}
            </p>
          </div>
        )
      })}
    </div>
  )
}
