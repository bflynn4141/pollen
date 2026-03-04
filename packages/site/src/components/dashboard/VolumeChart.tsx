import { Suspense } from 'react'
import PeriodSelector from './PeriodSelector'

interface VolumeItem {
  name: string
  count: number
}

interface Props {
  title: string
  items: VolumeItem[]
  color: string
  labelWidth?: number
}

export default function VolumeChart({ title, items, color, labelWidth = 110 }: Props) {
  const maxCount = items.length > 0 ? items[0].count : 1
  const top10 = items.slice(0, 10)

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h3
          className="font-[family-name:var(--font-grotesk)] text-lg font-bold"
          style={{ color: 'var(--text)' }}
        >
          {title}
        </h3>
        <div className="flex items-center gap-3">
          <Suspense fallback={null}>
            <PeriodSelector />
          </Suspense>
          <button
            className="rounded-md border px-3 py-[5px] text-[11px] font-medium"
            style={{ borderColor: 'var(--export-border)', color: 'var(--text-dim)' }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Bars */}
      <div className="flex flex-col" style={{ gap: 14 }}>
        {top10.map(item => (
          <div key={item.name} className="flex items-center" style={{ height: 48 }}>
            <span
              className="shrink-0 truncate text-[13px] font-medium"
              style={{ width: labelWidth, color: 'var(--text)' }}
            >
              {item.name}
            </span>
            <div
              className="mx-3 flex-1 rounded"
              style={{ height: 28, background: 'var(--bar-track)' }}
            >
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.max((item.count / maxCount) * 100, 2)}%`,
                  background: color,
                }}
              />
            </div>
            <span
              className="shrink-0 text-right font-[family-name:var(--font-mono)] text-xs font-medium"
              style={{ width: 48, color: 'var(--text-count)' }}
            >
              {item.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
