'use client'

import { ResponsiveBar } from '@nivo/bar'
import { pollenTheme, NIVO_COLORS } from '@/lib/nivo-theme'

interface Props {
  data: { id: string; value: number; badge?: string }[]
  color?: string
  showBadge?: boolean
  height?: number
}

export default function NivoBarRanking({ data, color, showBadge, height = 300 }: Props) {
  if (data.length === 0) return null

  return (
    <div style={{ height }}>
      <ResponsiveBar
        data={data}
        keys={['value']}
        indexBy="id"
        layout="horizontal"
        margin={{ top: 0, right: 40, bottom: 0, left: 120 }}
        padding={0.35}
        colors={color ? [color] : NIVO_COLORS}
        theme={pollenTheme}
        borderRadius={3}
        enableGridX={false}
        enableGridY={false}
        axisTop={null}
        axisRight={null}
        axisBottom={null}
        axisLeft={{
          tickSize: 0,
          tickPadding: 8,
          format: (v: string) => v.length > 18 ? v.slice(0, 16) + '…' : v,
        }}
        labelSkipWidth={32}
        label={d => {
          const item = data.find(i => i.id === d.indexValue)
          const badge = showBadge && item?.badge ? ` ${item.badge}` : ''
          return `${d.value?.toLocaleString()}${badge}`
        }}
        labelTextColor="#FFFFFF"
        tooltip={({ indexValue, value }) => (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EBEBEA',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '8px 12px',
            fontSize: 12,
            color: '#1A1A1A',
          }}>
            <strong>{indexValue}</strong>: {value?.toLocaleString()}
          </div>
        )}
        animate={true}
        motionConfig="gentle"
      />
    </div>
  )
}
