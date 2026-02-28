'use client'

import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface Props {
  data: { date: string; normalized: number; count: number }[]
  height?: number
  color?: string
}

export default function NormalizedTrendLine({ data, height = 320, color = '#C8B6FF' }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-500">
        No data for this query
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
        <defs>
          <linearGradient id="normalizedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#999', fontSize: 11 }}
          tickFormatter={d => d.slice(5)}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#999', fontSize: 11 }}
          label={{ value: 'Interest', angle: -90, position: 'insideLeft', fill: '#999', fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid #333', borderRadius: 8 }}
          labelStyle={{ color: '#999' }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((value: any, name: any) => {
            if (name === 'normalized') return [`${value ?? 0}`, 'Interest']
            return [`${value ?? 0}`, 'Sessions']
          }) as any}
        />
        <Area
          type="monotone"
          dataKey="normalized"
          stroke={color}
          strokeWidth={2}
          fill="url(#normalizedGradient)"
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
