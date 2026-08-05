/**
 * Pro-rata payout math.
 *
 * amount_i = floor(pool * score_i / total_score), computed entirely in bigint
 * so rounding dust always favors the pool: sum(amount_i) <= pool, which keeps
 * mintBatch under the on-chain epochPool cap by construction.
 *
 * Scores arrive from Neon as NUMERIC strings (up to 4 decimal places from the
 * epoch-close cron). They are scaled to integers (1e6) via decimal string
 * parsing — no floating point anywhere in the money path.
 */

export interface EligibleScore {
  contributor_id: string
  wallet_address: string
  score: string // NUMERIC from Postgres
}

export interface PayoutAmount {
  contributor_id: string
  wallet_address: string
  score: string
  amountWei: bigint
}

const SCORE_SCALE_DECIMALS = 6

/** Parse a non-negative decimal string into a bigint scaled by 10^decimals. */
export function scaleDecimal(value: string, decimals: number = SCORE_SCALE_DECIMALS): bigint {
  const trimmed = value.trim()
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed)
  if (!match) {
    throw new Error(`invalid non-negative decimal: "${value}"`)
  }
  const whole = match[1]
  const frac = (match[2] ?? '').slice(0, decimals).padEnd(decimals, '0')
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac)
}

/**
 * Compute floor pro-rata payouts. Zero amounts are dropped.
 * Guarantees sum(amounts) <= poolWei.
 */
export function computePayouts(rows: EligibleScore[], poolWei: bigint): PayoutAmount[] {
  const scaled = rows.map(r => ({ ...r, scaledScore: scaleDecimal(r.score) }))
  const total = scaled.reduce((sum, r) => sum + r.scaledScore, 0n)
  if (total === 0n) return []

  const out: PayoutAmount[] = []
  for (const r of scaled) {
    const amountWei = (poolWei * r.scaledScore) / total // bigint division = floor
    if (amountWei === 0n) continue
    out.push({
      contributor_id: r.contributor_id,
      wallet_address: r.wallet_address,
      score: r.score,
      amountWei,
    })
  }
  return out
}
