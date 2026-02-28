'use client'

interface Cell {
  day: number
  hour: number
  count: number
}

interface Props {
  cells: Cell[]
  maxCount: number
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CELL_SIZE = 18
const GAP = 2

export default function HeatMap({ cells, maxCount }: Props) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0) as number[])
  for (const c of cells) {
    if (c.day >= 0 && c.day < 7 && c.hour >= 0 && c.hour < 24) {
      grid[c.day][c.hour] = c.count
    }
  }

  const width = 24 * (CELL_SIZE + GAP) + 40
  const height = 7 * (CELL_SIZE + GAP) + 30

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="max-w-full">
      {/* Hour labels */}
      {[0, 6, 12, 18, 23].map(h => (
        <text
          key={h}
          x={40 + h * (CELL_SIZE + GAP) + CELL_SIZE / 2}
          y={12}
          textAnchor="middle"
          fill="#999"
          fontSize={10}
        >
          {h}:00
        </text>
      ))}
      {/* Day labels + cells */}
      {grid.map((hours, day) => (
        <g key={day}>
          <text
            x={0}
            y={24 + day * (CELL_SIZE + GAP) + CELL_SIZE / 2 + 4}
            fill="#999"
            fontSize={11}
          >
            {DAYS[day]}
          </text>
          {hours.map((count, hour) => (
            <rect
              key={hour}
              x={40 + hour * (CELL_SIZE + GAP)}
              y={20 + day * (CELL_SIZE + GAP)}
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={3}
              fill={cellColor(count, maxCount)}
            >
              <title>{`${DAYS[day]} ${hour}:00 — ${count} events`}</title>
            </rect>
          ))}
        </g>
      ))}
    </svg>
  )
}

function cellColor(count: number, max: number): string {
  if (count === 0 || max === 0) return '#1a1a2e'
  const intensity = count / max
  if (intensity > 0.75) return '#C8B6FF'
  if (intensity > 0.5) return '#9B8ED8'
  if (intensity > 0.25) return '#6B5F9E'
  return '#3B3565'
}
