import { Suspense } from 'react'
import PeriodSelector from './PeriodSelector'

interface Props {
  title: string
  items: { name: string; count: number }[]
  color: string
  labelWidth?: number
}

export default function VolumeChart({ title, items, color, labelWidth = 110 }: Props) {
  const maxCount = items.length > 0 ? items[0].count : 1
  const top10 = items.slice(0, 10)

  return (
    <div>
      {/* Header row */}
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-grotesk)] text-lg font-bold text-text">
          {title}
        </h3>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <PeriodSelector />
          </Suspense>
          <button className="rounded-md border border-export-border px-3 py-[5px] text-[11px] font-medium text-text-dim transition-colors hover:text-text-muted">
            Export CSV
          </button>
        </div>
      </div>

      {/* Bar rows */}
      <div className="flex flex-col gap-3.5">
        {top10.map(item => (
          <div key={item.name} className="flex h-12 items-center">
            {/* Label */}
            <span
              className="shrink-0 truncate pr-4 text-[13px] font-medium text-text"
              style={{ width: labelWidth }}
            >
              {item.name}
            </span>

            {/* Track + fill */}
            <div className="flex-1 rounded bg-bar-track" style={{ height: 28 }}>
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.max((item.count / maxCount) * 100, 2)}%`,
                  backgroundColor: color,
                }}
              />
            </div>

            {/* Count */}
            <span className="w-12 shrink-0 pl-3 text-right font-[family-name:var(--font-mono)] text-xs font-medium text-text-count">
              {item.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
