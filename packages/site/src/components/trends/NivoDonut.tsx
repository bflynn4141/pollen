'use client'

import { ResponsivePie } from '@nivo/pie'
import type { PieTooltipProps } from '@nivo/pie'
import { pollenTheme, NIVO_COLORS } from '@/lib/nivo-theme'

interface DonutDatum {
  id: string
  label: string
  value: number
}

interface Props {
  data: DonutDatum[]
  height?: number
}

export default function NivoDonut({ data, height = 280 }: Props) {
  if (data.length === 0) return null

  return (
    <div style={{ height }}>
      <ResponsivePie<DonutDatum>
        data={data}
        margin={{ top: 20, right: 80, bottom: 20, left: 80 }}
        innerRadius={0.55}
        padAngle={1.5}
        cornerRadius={4}
        colors={NIVO_COLORS}
        theme={pollenTheme}
        borderWidth={0}
        enableArcLinkLabels={true}
        arcLinkLabelsSkipAngle={12}
        arcLinkLabelsTextColor="#8A8A82"
        arcLinkLabelsThickness={1}
        arcLinkLabelsColor={{ from: 'color' }}
        arcLinkLabelsDiagonalLength={12}
        arcLinkLabelsStraightLength={8}
        arcLabelsSkipAngle={20}
        arcLabelsTextColor="#FFFFFF"
        tooltip={({ datum }: PieTooltipProps<DonutDatum>) => (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EBEBEA',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '8px 12px',
            fontSize: 12,
            color: '#1A1A1A',
          }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: datum.color, marginRight: 6 }} />
            <strong>{datum.label}</strong>: {datum.value.toLocaleString()} ({datum.formattedValue})
          </div>
        )}
        animate={true}
        motionConfig="gentle"
      />
    </div>
  )
}
