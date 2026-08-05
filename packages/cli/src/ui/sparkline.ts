/**
 * Render a sparkline from an array of numbers.
 *
 * Maps values proportionally across the Unicode block elements ▁▂▃▄▅▆▇█
 * where the minimum maps to ▁ and the maximum maps to █.
 */
const BLOCKS = '▁▂▃▄▅▆▇█'

export function sparkline(values: number[]): string {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values
    .map(v => {
      const idx = Math.round(((v - min) / range) * (BLOCKS.length - 1))
      return BLOCKS[idx]
    })
    .join('')
}
