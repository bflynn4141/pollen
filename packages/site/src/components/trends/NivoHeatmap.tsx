'use client'

import { ResponsiveHeatMap } from '@nivo/heatmap'
import { pollenTheme } from '@/lib/nivo-theme'

interface HeatmapRow {
  id: string
  data: { x: string; y: number | null }[]
}

interface Props {
  data: HeatmapRow[]
  height?: number
  minColor?: string
  maxColor?: string
}

export default function NivoHeatmap({ data, height = 300, minColor = '#FAFAF8', maxColor = '#C66A3B' }: Props) {
  if (data.length === 0) return null

  return (
    <div style={{ height }}>
      <ResponsiveHeatMap
        data={data}
        margin={{ top: 30, right: 20, bottom: 10, left: 50 }}
        theme={pollenTheme}
        colors={{
          type: 'sequential',
          scheme: 'oranges',
          minValue: 0,
        }}
        emptyColor="#F5F5F3"
        borderRadius={2}
        borderWidth={1}
        borderColor="#FFFFFF"
        enableLabels={false}
        axisTop={{
          tickSize: 0,
          tickPadding: 4,
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 6,
        }}
        tooltip={({ cell }) => (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EBEBEA',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '8px 12px',
            fontSize: 12,
            color: '#1A1A1A',
          }}>
            <strong>{cell.serieId}</strong> × <strong>{cell.data.x}</strong>: {cell.data.y?.toLocaleString() ?? 0}
          </div>
        )}
        animate={true}
        motionConfig="gentle"
      />
    </div>
  )
}
