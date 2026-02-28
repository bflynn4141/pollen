'use client'

import { CHART_SERIES_COLORS } from '@/lib/colors'

interface Arc {
  intent: string
  outcome: string
  count: number
}

interface Props {
  arcs: Arc[]
}

export default function SankeyFlow({ arcs }: Props) {
  if (arcs.length === 0) {
    return <p className="text-gray-500 text-sm">No session data yet</p>
  }

  const intents = [...new Set(arcs.map(a => a.intent))]
  const outcomes = [...new Set(arcs.map(a => a.outcome))]
  const maxCount = Math.max(...arcs.map(a => a.count))

  const intentTotals = intents.map(intent => ({
    intent,
    total: arcs.filter(a => a.intent === intent).reduce((s, a) => s + a.count, 0),
  })).sort((a, b) => b.total - a.total)

  const outcomeColors: Record<string, string> = {
    completed: '#88D8B0',
    abandoned: '#ff6b6b',
    error_exit: '#F5D89A',
  }

  const svgHeight = Math.max(intents.length, outcomes.length) * 40 + 40
  const intentY = (i: number) => 30 + i * 40
  const outcomeY = (i: number) => 30 + i * 40

  return (
    <svg width="100%" viewBox={`0 0 500 ${svgHeight}`} className="max-w-full">
      {/* Intent labels (left) */}
      {intentTotals.map((item, i) => (
        <text key={item.intent} x={5} y={intentY(i) + 5} fill="#ccc" fontSize={12}>
          {item.intent.replace('_', ' ')}
        </text>
      ))}

      {/* Outcome labels (right) */}
      {outcomes.map((outcome, i) => (
        <text key={outcome} x={495} y={outcomeY(i) + 5} fill={outcomeColors[outcome] ?? '#ccc'} fontSize={12} textAnchor="end">
          {outcome.replace('_', ' ')}
        </text>
      ))}

      {/* Flow paths */}
      {arcs.map((arc, idx) => {
        const iIdx = intentTotals.findIndex(it => it.intent === arc.intent)
        const oIdx = outcomes.indexOf(arc.outcome)
        if (iIdx < 0 || oIdx < 0) return null
        const x1 = 130
        const x2 = 370
        const y1 = intentY(iIdx)
        const y2 = outcomeY(oIdx)
        const opacity = 0.2 + 0.6 * (arc.count / maxCount)
        return (
          <path
            key={idx}
            d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`}
            fill="none"
            stroke={outcomeColors[arc.outcome] ?? CHART_SERIES_COLORS[idx % CHART_SERIES_COLORS.length]}
            strokeWidth={Math.max(1, (arc.count / maxCount) * 8)}
            opacity={opacity}
          >
            <title>{`${arc.intent} → ${arc.outcome}: ${arc.count}`}</title>
          </path>
        )
      })}
    </svg>
  )
}
