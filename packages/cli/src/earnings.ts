/**
 * `pollen earnings` — shows epoch scores, score breakdowns, and payouts.
 *
 * Reads the real Phase-B tables from Neon (migration 003_contributors.sql):
 *   epoch_scores(epoch, contributor_id, score, breakdown JSONB, computed_at)
 *   payouts(epoch, contributor_id, wallet_address, amount, tx_hash, status)
 *
 * The breakdown JSONB carries the receipt-backed scoring-v2 components (or
 * historical scoring-v1 components) written by the epoch-close cron and is
 * rendered here for transparency. Falls back gracefully when the tables
 * aren't migrated yet.
 */
import { neon } from '@neondatabase/serverless'
import { loadConfig, type ParaWallet } from './config.js'
import { currentEpoch, epochBounds, nextEpochClose } from './credits.js'
import { epochPool } from './epoch.js'

function bar(ratio: number, width = 20): string {
  const filled = Math.round(ratio * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function epochLabel(epoch: number): string {
  const bounds = epochBounds(epoch)
  return `Week ${epoch} (${formatDate(bounds.starts_at)} - ${formatDate(bounds.ends_at)})`
}

function payoutStatusIcon(status: string): string {
  switch (status) {
    case 'confirmed': return '✓'  // checkmark
    case 'pending': return '○'    // open circle
    case 'failed': return '✗'     // cross
    default: return '?'
  }
}

/** Versioned breakdown JSONB written by the epoch-close cron. */
export interface ScoreBreakdown {
  formula?: string
  active_days?: number
  receipts_scored?: number | string
  receipt_points?: number | string
  tool_steps_capped?: number | string
  completed_receipts?: number | string
  checked_receipts?: number | string
  distinct_intents?: number | string
  distinct_agents?: number | string
  distinct_models?: number | string
  weighted_sessions?: number | string
  tool_events_capped?: number | string
  avg_satisfaction?: number | string | null
  quality_multiplier?: number | string
  base_score?: number | string
}

export interface EpochScoreRow {
  epoch: number
  score: number
  breakdown: ScoreBreakdown | null
}

export interface PayoutRow {
  epoch: number
  amount: string
  status: string
  tx_hash: string | null
}

export interface EarningsData {
  contributorId: string
  walletAddress: string | null
  paraWallet: ParaWallet | null
  worldIdVerified: boolean
  currentEpoch: number
  /** null = epoch_scores table not migrated yet */
  scores: EpochScoreRow[] | null
  /** null = payouts table not migrated yet */
  payouts: PayoutRow[] | null
}

export async function fetchEarnings(connectionString: string): Promise<EarningsData | null> {
  const config = loadConfig()
  if (!config) return null

  const sql = neon(connectionString)

  // Graceful degradation: either table may not be migrated yet.
  const scores = await (async (): Promise<EpochScoreRow[] | null> => {
    try {
      const rows = await sql`
        SELECT epoch, score::float8 AS score, breakdown
        FROM epoch_scores
        WHERE contributor_id = ${config.contributor_id}
        ORDER BY epoch DESC
      `
      return rows.map(r => ({
        epoch: r.epoch as number,
        score: Number(r.score),
        breakdown: (r.breakdown as ScoreBreakdown | null) ?? null,
      }))
    } catch {
      return null
    }
  })()

  const payouts = await (async (): Promise<PayoutRow[] | null> => {
    try {
      const rows = await sql`
        SELECT epoch, amount::text AS amount, status, tx_hash
        FROM payouts
        WHERE contributor_id = ${config.contributor_id}
        ORDER BY epoch DESC
      `
      return rows.map(r => ({
        epoch: r.epoch as number,
        amount: r.amount as string,
        status: r.status as string,
        tx_hash: (r.tx_hash as string | null) ?? null,
      }))
    } catch {
      return null
    }
  })()

  return {
    contributorId: config.contributor_id,
    walletAddress: config.wallet_address ?? null,
    paraWallet: config.para_wallet ?? null,
    worldIdVerified: !!config.world_id,
    currentEpoch: currentEpoch(),
    scores,
    payouts,
  }
}

function formatComponent(value: number | string | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '-'
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(digits) : String(value)
}

export function renderEarnings(data: EarningsData): string {
  const lines: string[] = []

  // Header
  lines.push('Pollen Earnings')
  lines.push('===============')
  lines.push('')

  // Identity
  lines.push(`  Contributor:  ${data.contributorId.slice(0, 8)}...`)
  lines.push(`  World ID:     ${data.worldIdVerified ? '✓ verified' : '✗ not verified (run pollen verify)'}`)
  const walletDisplay = data.paraWallet
    ? `${data.paraWallet.address} (${data.paraWallet.email})`
    : data.walletAddress ?? 'not set (run pollen wallet)'
  lines.push(`  Wallet:       ${walletDisplay}`)
  lines.push('')

  // Emission info
  const pool = epochPool(data.currentEpoch)
  const poolTokens = Number(pool / 10n ** 18n).toLocaleString()
  lines.push(`  Current Epoch: ${data.currentEpoch}`)
  lines.push(`  Epoch Pool:    ${poolTokens} POLLEN (halves every 13 epochs)`)
  lines.push(`  Next Payout:   ${formatDate(nextEpochClose().getTime())} (epochs close Tuesdays 00:00 UTC)`)
  lines.push('')

  // Scores by epoch (real epoch_scores + versioned transparent breakdown)
  if (data.scores === null) {
    lines.push('  (epoch_scores not available yet — run migration 003_contributors.sql)')
    lines.push('')
  } else if (data.scores.length === 0) {
    lines.push('  No epochs scored yet. Use Claude Code with the hook active, then `pollen sync`.')
    lines.push('')
  } else {
    lines.push('Scores by Epoch')
    lines.push('---------------')

    const maxScore = Math.max(...data.scores.map(e => e.score))
    for (const { epoch, score, breakdown } of data.scores) {
      const b = bar(maxScore > 0 ? score / maxScore : 0, 15)
      lines.push(`  ${epochLabel(epoch).padEnd(40)} ${score.toFixed(2).padStart(10)}  ${b}`)
      if (breakdown) {
        if (breakdown.formula === 'v2-network-receipts') {
          lines.push(
            `    Active days: ${formatComponent(breakdown.active_days, 0)}` +
            `  Receipts (capped): ${formatComponent(breakdown.receipts_scored, 0)}` +
            `  Receipt points: ${formatComponent(breakdown.receipt_points)}`,
          )
          lines.push(
            `    Completed: ${formatComponent(breakdown.completed_receipts, 0)}` +
            `  Checks run: ${formatComponent(breakdown.checked_receipts, 0)}` +
            `  Tool steps (capped): ${formatComponent(breakdown.tool_steps_capped, 0)}`,
          )
          lines.push(
            `    Diversity (not score-weighted): ${formatComponent(breakdown.distinct_intents, 0)} intents` +
            `  ${formatComponent(breakdown.distinct_agents, 0)} agents` +
            `  ${formatComponent(breakdown.distinct_models, 0)} models`,
          )
        } else {
          lines.push(
            `    Active days: ${formatComponent(breakdown.active_days, 0)}` +
            `  Sessions (weighted): ${formatComponent(breakdown.weighted_sessions)}` +
            `  Tool events (capped): ${formatComponent(breakdown.tool_events_capped, 0)}`,
          )
          lines.push(
            `    Base score:  ${formatComponent(breakdown.base_score)}` +
            `  Quality multiplier:  ${formatComponent(breakdown.quality_multiplier, 4)}` +
            `  Avg satisfaction: ${formatComponent(breakdown.avg_satisfaction)}`,
          )
        }
      }
    }
    lines.push('')
  }

  // Payouts (pushed automatically by the payout agent)
  if (data.payouts === null) {
    lines.push('  (payouts not available yet — run migration 003_contributors.sql)')
    lines.push('')
  } else if (data.payouts.length > 0) {
    lines.push('Payouts')
    lines.push('-------')
    for (const p of data.payouts) {
      const tx = p.tx_hash ? `  tx: ${p.tx_hash.slice(0, 14)}...` : ''
      lines.push(`  ${payoutStatusIcon(p.status)} ${epochLabel(p.epoch).padEnd(40)} ${Number(p.amount).toLocaleString().padStart(12)} POLLEN  [${p.status}]${tx}`)
    }
    lines.push('')
  } else {
    lines.push('  No payouts yet. Payouts are automatic: verified contributors receive')
    lines.push('  POLLEN weekly after each epoch closes (Tuesdays 00:00 UTC).')
    lines.push('')
  }

  // Eligibility warnings
  if (!data.worldIdVerified) {
    lines.push('  ⚠  World ID required to receive payouts. Run: pollen verify')
  }
  if (!data.walletAddress && !data.paraWallet) {
    lines.push('  ⚠  Wallet required to receive payouts. Run: pollen wallet')
  }

  lines.push('')
  return lines.join('\n')
}
