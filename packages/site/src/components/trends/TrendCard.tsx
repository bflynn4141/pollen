'use client'

import { ResponsiveLine } from '@nivo/line'
import { sparklineProps, NIVO_COLORS } from '@/lib/nivo-theme'

interface Props {
  label: string
  value: string | number
  sparkline?: { date: string; count: number }[]
  delta?: string
  color?: string
}

export default function TrendCard({ label, value, sparkline, delta, color = NIVO_COLORS[0] }: Props) {
  return (
    <div
      className="rounded-xl border p-5"
      style={{ borderColor: 'var(--t-border, #EBEBEA)', background: 'var(--t-surface, #FFFFFF)' }}
    >
      <p className="text-sm" style={{ color: 'var(--t-text-muted, #8A8A82)' }}>{label}</p>
      <div className="mt-1 flex items-end justify-between">
        <p className="text-3xl font-bold" style={{ color: 'var(--t-text, #1A1A1A)' }}>{value}</p>
        {delta && (
          <span className="text-sm" style={{ color: 'var(--t-text-muted, #8A8A82)' }}>{delta}</span>
        )}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 h-10">
          <ResponsiveLine
            {...sparklineProps}
            data={[{
              id: label,
              data: sparkline.map(p => ({ x: p.date, y: p.count })),
            }]}
            colors={[color]}
            theme={{ background: 'transparent' }}
          />
        </div>
      )}
    </div>
  )
}
