'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface Props {
  label: string
  value: string | number
  sparkline?: { date: string; count: number }[]
  delta?: string // e.g. "+12%" or "auth"
  color?: string
}

export default function TrendCard({ label, value, sparkline, delta, color = '#C8B6FF' }: Props) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-gray-400">{label}</p>
      <div className="mt-1 flex items-end justify-between">
        <p className="text-3xl font-bold text-white">{value}</p>
        {delta && (
          <span className="text-sm text-gray-400">{delta}</span>
        )}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkline}>
              <Line
                type="monotone"
                dataKey="count"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
