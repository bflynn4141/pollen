'use client'

import { ResponsiveSankey } from '@nivo/sankey'
import { NIVO_COLORS } from '@/lib/nivo-theme'

interface SankeyData {
  nodes: { id: string }[]
  links: { source: string; target: string; value: number }[]
}

interface Props {
  data: SankeyData
  height?: number
}

export default function NivoSankey({ data, height = 320 }: Props) {
  if (data.nodes.length === 0 || data.links.length === 0) return null

  return (
    <div style={{ height }}>
      <ResponsiveSankey
        data={data}
        margin={{ top: 10, right: 120, bottom: 10, left: 120 }}
        align="justify"
        colors={NIVO_COLORS}
        nodeOpacity={1}
        nodeThickness={14}
        nodeInnerPadding={2}
        nodeSpacing={16}
        nodeBorderWidth={0}
        linkOpacity={0.3}
        linkHoverOpacity={0.6}
        linkContract={2}
        linkBlendMode="normal"
        enableLinkGradient={true}
        labelPosition="outside"
        labelOrientation="horizontal"
        labelPadding={10}
        labelTextColor="#8A8A82"
        nodeTooltip={({ node }) => (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EBEBEA',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '8px 12px',
            fontSize: 12,
            color: '#1A1A1A',
          }}>
            <strong>{node.label}</strong>: {node.value.toLocaleString()}
          </div>
        )}
        linkTooltip={({ link }) => (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EBEBEA',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '8px 12px',
            fontSize: 12,
            color: '#1A1A1A',
          }}>
            {link.source.label} → {link.target.label}: {link.value.toLocaleString()}
          </div>
        )}
        animate={true}
        motionConfig="gentle"
      />
    </div>
  )
}
