interface StatCard {
  label: string
  value: string
  subtitle: string
}

export default function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className="grid grid-cols-3 gap-5">
      {cards.map((card, i) => (
        <div
          key={i}
          className="rounded-xl px-7 py-6"
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
          }}
        >
          <p
            className="text-xs font-medium uppercase tracking-[0.06em]"
            style={{ color: 'var(--text-muted)' }}
          >
            {card.label}
          </p>
          <p
            className="mt-2 font-[family-name:var(--font-mono)] text-[44px] font-bold leading-none tracking-[-0.03em]"
            style={{ color: 'var(--text)' }}
          >
            {card.value}
          </p>
          <p
            className="mt-2 text-[13px]"
            style={{ color: 'var(--text-muted)' }}
          >
            {card.subtitle}
          </p>
        </div>
      ))}
    </div>
  )
}
