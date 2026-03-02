import type { RankItem } from '@/lib/types'

interface Props {
  title: string
  items: RankItem[]
}

export default function TrendingList({ title, items }: Props) {
  const sorted = [...items]
    .filter(i => i.changePercent !== null)
    .sort((a, b) => Math.abs(b.changePercent!) - Math.abs(a.changePercent!))
    .slice(0, 10)

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-baseline justify-between">
        <h3 className="font-[family-name:var(--font-grotesk)] text-lg font-bold text-text">
          {title}
        </h3>
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-dim">
          vs last period
        </span>
      </div>

      {/* Rows */}
      <div>
        {sorted.map(item => {
          const isUp = item.trend === 'up'
          const isDown = item.trend === 'down'

          return (
            <div
              key={item.name}
              className="flex h-[52px] items-center border-b border-divider"
            >
              {/* Arrow */}
              <span className={`mr-2.5 text-sm ${isUp ? 'text-trend-up' : isDown ? 'text-trend-down' : 'text-text-dim'}`}>
                {isUp ? '↑' : isDown ? '↓' : '—'}
              </span>

              {/* Name */}
              <span className="flex-1 truncate text-sm font-medium text-text">
                {item.name}
              </span>

              {/* Change % */}
              <span className={`mr-4 font-[family-name:var(--font-mono)] text-[13px] font-semibold ${
                isUp ? 'text-trend-up' : isDown ? 'text-trend-down' : 'text-text-dim'
              }`}>
                {item.changePercent !== null
                  ? `${item.changePercent > 0 ? '+' : ''}${item.changePercent}%`
                  : '—'}
              </span>

              {/* Count */}
              <span className="text-[11px] text-text-dim">
                {item.count.toLocaleString()}
              </span>
            </div>
          )
        })}

        {sorted.length === 0 && (
          <div className="flex items-center justify-center py-10 text-sm text-text-dim">
            No trend data for this period
          </div>
        )}
      </div>
    </div>
  )
}
