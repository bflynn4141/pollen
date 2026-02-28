'use client'

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { CHART_SERIES_COLORS } from '@/lib/colors'

interface RankItem {
  name: string
  value: number
  color?: string
  badge?: string // e.g. "↑" "↓"
}

interface Props {
  data: RankItem[]
  height?: number
  color?: string
  showBadge?: boolean
}

export default function BarRanking({ data, height, color, showBadge }: Props) {
  const h = height ?? Math.max(200, data.length * 32)

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 80 }}>
        <XAxis type="number" tick={{ fill: '#999', fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: '#ccc', fontSize: 12 }}
          width={75}
          tickFormatter={n => {
            const item = data.find(d => d.name === n)
            return showBadge && item?.badge ? `${n} ${item.badge}` : n
          }}
        />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8 }}
          labelStyle={{ color: '#999' }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={entry.color ?? color ?? CHART_SERIES_COLORS[i % CHART_SERIES_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
