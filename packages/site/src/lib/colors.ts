// Consistent topic/tool colors across all charts.
// Named colors match CSS variables from the pollen palette.

export const TOPIC_COLORS: Record<string, string> = {
  auth: '#F2B5D4',       // pollen-pink
  api: '#C8B6FF',        // pollen-lavender
  web3: '#A8D8EA',       // pollen-blue
  database: '#F5D89A',   // pollen-gold
  ui: '#B5D5C5',         // pollen-sage
  testing: '#7C6FA0',    // accent
  infra: '#E8A87C',
  errors: '#ff6b6b',
  ai: '#88D8B0',
  devops: '#D4A5FF',
  styling: '#FFB5A7',
  config: '#CDB4DB',
  security: '#FFC8DD',
  performance: '#BDE0FE',
  docs: '#A2D2FF',
  state: '#FFAFCC',
}

export const CHART_SERIES_COLORS = [
  '#C8B6FF', '#F2B5D4', '#A8D8EA', '#F5D89A', '#B5D5C5',
  '#7C6FA0', '#E8A87C', '#ff6b6b', '#88D8B0', '#D4A5FF',
]

export function getTopicColor(topic: string): string {
  return TOPIC_COLORS[topic] ?? CHART_SERIES_COLORS[
    Math.abs(hashCode(topic)) % CHART_SERIES_COLORS.length
  ]
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return h
}
