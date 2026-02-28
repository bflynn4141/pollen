import type { SessionDepth } from './types.js'

export function coarsenDepth(promptIndex: number): SessionDepth {
  if (promptIndex <= 1) return 'first'
  if (promptIndex <= 5) return 'early'
  if (promptIndex <= 15) return 'mid'
  return 'deep'
}
