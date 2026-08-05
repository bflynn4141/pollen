// ── Warm editorial palette ──
// Designed for a data showroom that feels premium and inviting,
// not generic SaaS. Warm brown-orange accent with blue-gray counterpoint.

const palette = {
  accent:     '#C66A3B',   // warm brown-orange
  secondary:  '#5F7D85',   // blue-gray
  success:    '#4B8054',   // forest green
  tertiary:   '#6D5A82',   // muted purple
  error:      '#C44A3F',   // warm red

  bg:         '#FFFFFF',
  grid:       '#E8E4DF',   // warm gray gridlines
  text:       '#1A1A1A',   // primary text
  muted:      '#8A8A82',   // secondary text
  dim:        '#A09A94',   // tertiary text / tick labels

  tooltipBg:     '#FFFFFF',
  tooltipBorder: '#EBEBEA',
} as const

// Series colors — ordered for maximum contrast between adjacent slices/bars.
// Warm → cool → warm alternation prevents adjacent chart segments from blending.
export const NIVO_COLORS = [
  palette.accent,    // warm brown-orange
  palette.secondary, // blue-gray
  palette.success,   // forest green
  palette.tertiary,  // muted purple
  palette.error,     // warm red
  '#D4915E',         // soft terracotta
  '#7CA4AC',         // light teal
  '#8B6E4F',         // dark tan
  '#9B8AB8',         // light purple
  '#6A9E74',         // sage green
]

export const pollenTheme = {
  background: palette.bg,

  text: {
    fill: palette.text,
    fontSize: 12,
    fontFamily: 'inherit',
  },

  axis: {
    domain: {
      line: {
        stroke: palette.grid,
        strokeWidth: 1,
      },
    },
    ticks: {
      line: {
        stroke: palette.grid,
        strokeWidth: 1,
      },
      text: {
        fill: palette.dim,
        fontSize: 11,
      },
    },
    legend: {
      text: {
        fill: palette.muted,
        fontSize: 12,
        fontWeight: 500,
      },
    },
  },

  grid: {
    line: {
      stroke: palette.grid,
      strokeWidth: 1,
      strokeDasharray: '3 3',
    },
  },

  crosshair: {
    line: {
      stroke: palette.muted,
      strokeWidth: 1,
      strokeOpacity: 0.5,
      strokeDasharray: '4 4',
    },
  },

  labels: {
    text: {
      fill: palette.text,
      fontSize: 11,
      fontWeight: 600,
    },
  },

  legends: {
    text: {
      fill: palette.muted,
      fontSize: 11,
    },
  },

  tooltip: {
    container: {
      background: palette.tooltipBg,
      border: `1px solid ${palette.tooltipBorder}`,
      borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      padding: '8px 12px',
      fontSize: '12px',
      color: palette.text,
    },
  },

  dots: {
    text: {
      fill: palette.text,
      fontSize: 11,
    },
  },

  annotations: {
    text: {
      fill: palette.muted,
      fontSize: 11,
      outlineWidth: 2,
      outlineColor: palette.bg,
      outlineOpacity: 1,
    },
    link: {
      stroke: palette.muted,
      strokeWidth: 1,
      outlineWidth: 2,
      outlineColor: palette.bg,
      outlineOpacity: 1,
    },
    outline: {
      stroke: palette.muted,
      strokeWidth: 1,
      outlineWidth: 2,
      outlineColor: palette.bg,
      outlineOpacity: 1,
    },
    symbol: {
      fill: palette.accent,
      outlineWidth: 2,
      outlineColor: palette.bg,
      outlineOpacity: 1,
    },
  },
}

// Common props for sparkline-style charts (small, no axes, inline).
// Usage: <ResponsiveLine {...sparklineProps} data={data} colors={[NIVO_COLORS[0]]} />
export const sparklineProps = {
  margin: { top: 4, right: 4, bottom: 4, left: 4 },
  enableGridX: false,
  enableGridY: false,
  enablePoints: false,
  axisTop: null,
  axisRight: null,
  axisBottom: null,
  axisLeft: null,
  isInteractive: false,
  enableArea: true,
  areaOpacity: 0.15,
  lineWidth: 2,
  animate: false,
} as const
