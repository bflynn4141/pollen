'use client'

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { CHART_SERIES_COLORS } from '@/lib/colors'

interface Series {
  name: string
  data: { date: string; count: number }[]
  color?: string
}

interface Props {
  series: Series[]
  height?: number
  yLabel?: string
}

export default function TrendLine({ series, height = 300, yLabel }: Props) {
  // Merge all series into a unified dataset keyed by date
  const dateMap = new Map<string, Record<string, number>>()
  for (const s of series) {
    for (const pt of s.data) {
      if (!dateMap.has(pt.date)) dateMap.set(pt.date, {})
      dateMap.get(pt.date)![s.name] = pt.count
    }
  }
  const merged = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date, ...vals }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={merged} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#999', fontSize: 11 }}
          tickFormatter={d => d.slice(5)} // MM-DD
        />
        <YAxis
          tick={{ fill: '#999', fontSize: 11 }}
          label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fill: '#999' } : undefined}
        />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8 }}
          labelStyle={{ color: '#999' }}
        />
        {series.map((s, i) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={s.color ?? CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
