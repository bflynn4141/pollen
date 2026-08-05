import { ImageResponse } from 'next/og'
import { readTrendingTools } from '@pollen/data'
import { isValidWeek, weekRangeLabel } from '@pollen/data'

// Per-week OG card: white background, top-5 movers, "pollen" wordmark.
// Reads ONLY the k-anonymized rollup layer.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600

const UP = '#2D8A4E'
const DOWN = '#C44A3F'
const INK = '#1A1A1A'
const MUTED = '#8A8A82'
const ACCENT = '#C45D3E'

export default async function Image({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params

  let movers: { tool: string; calls: number; label: string; color: string }[] = []
  if (isValidWeek(week)) {
    try {
      const tools = await readTrendingTools(week)
      movers = tools
        .slice()
        .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0) || b.calls - a.calls)
        .slice(0, 5)
        .map(t => ({
          tool: t.kind === 'mcp' && t.server ? t.tool.replace(`mcp__${t.server}__`, `${t.server}·`) : t.tool,
          calls: t.calls,
          label: t.isNew
            ? 'new'
            : t.changePct == null || t.trend === 'stable'
              ? '—'
              : `${t.trend === 'up' ? '↑' : '↓'} ${Math.abs(t.changePct)}%`,
          color: t.trend === 'down' ? DOWN : t.trend === 'up' ? UP : MUTED,
        }))
    } catch {
      // Render the frame without rows if the database is unreachable.
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#FFFFFF',
          padding: '56px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 44, fontWeight: 700, color: INK }}>Trending tool calls</div>
            <div style={{ fontSize: 26, color: MUTED, marginTop: 8 }}>
              {week} · {isValidWeek(week) ? weekRangeLabel(week) : ''}
            </div>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: ACCENT }}>pollen</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44, flexGrow: 1 }}>
          {movers.map((m, i) => (
            <div
              key={m.tool}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 0',
                borderBottom: i < movers.length - 1 ? '1px solid #EBEBEA' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ fontSize: 26, color: MUTED, width: 48 }}>{i + 1}</div>
                <div style={{ fontSize: 32, color: INK, fontWeight: 600 }}>{m.tool}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ fontSize: 26, color: MUTED, marginRight: 32 }}>
                  {m.calls.toLocaleString()} calls
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: m.color, width: 130, justifyContent: 'flex-end', display: 'flex' }}>
                  {m.label}
                </div>
              </div>
            </div>
          ))}
          {movers.length === 0 && (
            <div style={{ fontSize: 30, color: MUTED, marginTop: 40 }}>pollen.id/trending</div>
          )}
        </div>

        <div style={{ display: 'flex', fontSize: 22, color: MUTED }}>
          k-anonymized · every cell ≥ 5 contributors · pollen.id/trending/{week}
        </div>
      </div>
    ),
    size,
  )
}
