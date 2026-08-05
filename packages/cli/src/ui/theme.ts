// ── Colors ──

export const COPPER = '#C45D3E'
export const GOLD = '#D4A843'
export const MUTED = '#8A8580'
export const SUCCESS = '#4CAF50'
export const TEXT_DIM = '#6B6560'

// ── Tab bar ──

export const ACTIVE_TAB = COPPER
export const INACTIVE_TAB = MUTED

// ── Sync indicators ──
// All captured fields currently sync to Neon. The hook only captures
// anonymized features — never raw prompts or code. If we later add
// local-only columns (e.g. personal notes), add them here.

const LOCAL_ONLY_FIELDS = new Set<string>([
  // Currently empty — all fields sync.
])

export function syncIndicator(field: string): string {
  return LOCAL_ONLY_FIELDS.has(field) ? '⊙' : '☁'
}

// ── Box drawing ──

export const BOX = {
  tl: '╭', tr: '╮', bl: '╰', br: '╯',
  h: '─', v: '│',
} as const
