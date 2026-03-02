const STATS = [
  { value: '$48,291', label: 'QUERY REVENUE' },
  { value: '10,983', label: 'SESSIONS' },
  { value: '2,847', label: 'TOKEN HOLDERS' },
]

export default function StatsBar() {
  return (
    <section style={{ backgroundColor: '#1A1A1A', padding: '40px 80px' }}>
      <div className="mx-auto flex max-w-[960px] items-center justify-center">
        {STATS.map((stat, i) => (
          <div key={stat.label} className="flex items-center">
            {i > 0 && (
              <div className="mx-10 h-8 w-px" style={{ backgroundColor: '#333' }} />
            )}
            <div className="text-center">
              <p className="font-[family-name:var(--font-mono)] text-[28px] font-bold text-white">
                {stat.value}
              </p>
              <p
                className="mt-1 text-[12px] tracking-[0.08em]"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                {stat.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
