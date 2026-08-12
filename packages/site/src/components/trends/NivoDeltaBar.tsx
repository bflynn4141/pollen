'use client'

import { ResponsiveBar } from '@nivo/bar'
import { pollenTheme, NIVO_COLORS } from '@/lib/nivo-theme'

interface DeltaDatum extends Record<string, string | number> {
  id: string
  value: number
  sessions: number
}

interface Props {
  data: DeltaDatum[]
  height?: number
}

export default function NivoDeltaBar({ data, height = 200 }: Props) {
  if (data.length === 0) return null

  const delta = data.length === 2
    ? Math.round(data[0].value - data[1].value)
    : null

  return (
    <div>
      <div style={{ height }}>
        <ResponsiveBar<DeltaDatum>
          data={data}
          keys={['value']}
          indexBy="id"
          layout="vertical"
          margin={{ top: 10, right: 20, bottom: 30, left: 20 }}
          padding={0.4}
          colors={({ index }: { index: number }) => NIVO_COLORS[index % NIVO_COLORS.length]}
          theme={pollenTheme}
          borderRadius={4}
          enableGridX={false}
          enableGridY={false}
          axisTop={null}
          axisRight={null}
          axisLeft={null}
          axisBottom={{
            tickSize: 0,
            tickPadding: 8,
          }}
          label={d => `${d.value}%`}
          labelTextColor="#FFFFFF"
          tooltip={({ indexValue, value, data: d }) => (
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #EBEBEA',
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              padding: '8px 12px',
              fontSize: 12,
              color: '#1A1A1A',
            }}>
              <strong>{indexValue}</strong>: {value}% satisfaction
              <br />
              <span style={{ color: '#8A8A82' }}>{(d as Record<string, unknown>).sessions?.toLocaleString()} sessions</span>
            </div>
          )}
          animate={true}
          motionConfig="gentle"
        />
      </div>
      {delta !== null && (
        <p className="mt-2 text-center text-sm" style={{ color: 'var(--t-text-muted)' }}>
          {delta > 0 ? '+' : ''}{delta}pp {delta > 0 ? 'higher' : 'lower'} with MCP
        </p>
      )}
    </div>
  )
}
