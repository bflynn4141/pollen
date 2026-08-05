'use client'

import { ResponsiveLine } from '@nivo/line'
import { pollenTheme, NIVO_COLORS } from '@/lib/nivo-theme'

interface Series {
  id: string
  data: { x: string; y: number }[]
  color?: string
}

interface Props {
  series: Series[]
  height?: number
  yLabel?: string
  enableArea?: boolean
}

export default function NivoTrendLine({ series, height = 300, yLabel, enableArea = false }: Props) {
  if (series.length === 0 || series.every(s => s.data.length < 2)) return null

  return (
    <div style={{ height }}>
      <ResponsiveLine
        data={series}
        margin={{ top: 10, right: 20, bottom: 40, left: 50 }}
        xScale={{ type: 'point' }}
        yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false }}
        colors={series.map((s, i) => s.color ?? NIVO_COLORS[i % NIVO_COLORS.length])}
        theme={pollenTheme}
        curve="monotoneX"
        lineWidth={2}
        pointSize={0}
        enableArea={enableArea}
        areaOpacity={0.08}
        enableGridX={false}
        axisTop={null}
        axisRight={null}
        axisBottom={{
          tickSize: 0,
          tickPadding: 8,
          tickRotation: -30,
          format: (v: string) => {
            // Show shortened date: "Mar 6"
            const d = new Date(v)
            return isNaN(d.getTime()) ? v : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          },
          tickValues: series[0]?.data.length > 10
            ? Math.min(8, series[0].data.length)
            : undefined,
        }}
        axisLeft={{
          tickSize: 0,
          tickPadding: 8,
          legend: yLabel,
          legendOffset: -40,
          legendPosition: 'middle',
        }}
        enableCrosshair={true}
        useMesh={true}
        legends={series.length > 1 ? [{
          anchor: 'top-right',
          direction: 'column',
          itemWidth: 100,
          itemHeight: 18,
          symbolSize: 10,
          symbolShape: 'circle',
        }] : []}
        tooltip={({ point }) => (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EBEBEA',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '8px 12px',
            fontSize: 12,
            color: '#1A1A1A',
          }}>
            <strong>{point.seriesId}</strong><br />
            {String(point.data.xFormatted)}: {Number(point.data.yFormatted).toLocaleString()}
          </div>
        )}
        animate={true}
        motionConfig="gentle"
      />
    </div>
  )
}
