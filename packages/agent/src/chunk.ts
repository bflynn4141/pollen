/** Max recipients per mintBatch transaction (calldata + gas headroom). */
export const MAX_RECIPIENTS_PER_TX = 100

/** Split `items` into consecutive chunks of at most `size` elements. */
export function chunk<T>(items: T[], size: number = MAX_RECIPIENTS_PER_TX): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('chunk size must be a positive integer')
  }
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
