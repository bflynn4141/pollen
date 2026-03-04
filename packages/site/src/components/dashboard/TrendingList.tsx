interface TrendingItem {
  name: string
  changePercent: number | null
  count: number
  trend: 'up' | 'down' | 'stable'
}

interface Props {
  title: string
  items: TrendingItem[]
}

export default function TrendingList({ title, items }: Props) {
  const sorted = [...items]
    .filter(i => i.changePercent !== null)
    .sort((a, b) => Math.abs(b.changePercent!) - Math.abs(a.changePercent!))
    .slice(0, 10)

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-baseline justify-between">
        <h3
          className="font-[family-name:var(--font-grotesk)] text-lg font-bold"
          style={{ color: 'var(--text)' }}
        >
          {title}
        </h3>
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.05em]"
          style={{ color: 'var(--text-dim)' }}
        >
          vs last period
        </span>
      </div>

      {/* List */}
      <div>
        {sorted.map(item => {
          const isUp = item.trend === 'up'
          const isDown = item.trend === 'down'
          const trendColor = isUp
            ? 'var(--trend-up)'
            : isDown
              ? 'var(--trend-down)'
              : 'var(--text-dim)'
          const arrow = isUp ? '↑' : isDown ? '↓' : '—'

          return (
            <div
              key={item.name}
              className="flex items-center"
              style={{
                height: 52,
                borderBottom: '1px solid var(--divider)',
              }}
            >
              <span
                className="mr-2 text-sm"
                style={{ color: trendColor }}
              >
                {arrow}
              </span>
              <span
                className="flex-1 truncate text-sm font-medium"
                style={{ color: 'var(--text)' }}
              >
                {item.name}
              </span>
              <span
                className="mr-4 font-[family-name:var(--font-mono)] text-[13px] font-semibold"
                style={{ color: trendColor }}
              >
                {item.changePercent !== null
                  ? `${item.changePercent > 0 ? '+' : ''}${item.changePercent}%`
                  : '—'}
              </span>
              <span
                className="text-[11px]"
                style={{ color: 'var(--text-dim)' }}
              >
                {item.count.toLocaleString()}
              </span>
            </div>
          )
        })}

        {sorted.length === 0 && (
          <div
            className="flex items-center justify-center py-8 text-sm"
            style={{ color: 'var(--text-dim)' }}
          >
            No trend data for this period
          </div>
        )}
      </div>
    </div>
  )
}
