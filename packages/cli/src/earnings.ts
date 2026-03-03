/**
 * `pollen earnings` — shows credit balance, token balance, and claimable revenue.
 *
 * Reads from Neon (credits) and on-chain (POLLEN balance + revenue).
 * Falls back gracefully when chain data isn't available.
 */
import { neon } from '@neondatabase/serverless'
import { loadConfig, type ParaWallet } from './config.js'
import { currentEpoch, getContributorScores, listEpochs, epochBounds } from './credits.js'
import type { EpochRow } from './credits.js'
import { epochPool } from './epoch.js'
import type { IVSBreakdown } from './types.js'

function bar(ratio: number, width = 20): string {
  const filled = Math.round(ratio * width)
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)
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

function statusIcon(status: string): string {
  switch (status) {
    case 'open': return '\u25cb'       // open circle
    case 'closed': return '\u25cf'     // filled circle
    case 'published': return '\u2713'  // checkmark
    default: return '?'
  }
}

export interface IVSSessionRow {
  session_id: string
  subject: string | null
  information_value_score: number
  ivs_breakdown: IVSBreakdown | null
}

export interface EarningsData {
  contributorId: string
  walletAddress: string | null
  paraWallet: ParaWallet | null
  worldIdVerified: boolean
  currentEpoch: number
  totalScore: number
  scoresByEpoch: Array<{ epoch: number; score: number }>
  epochs: EpochRow[]
  recentSessions: IVSSessionRow[]
}

export async function fetchEarnings(connectionString: string): Promise<EarningsData | null> {
  const config = loadConfig()
  if (!config) return null

  const sql = neon(connectionString)

  const [scores, epochs, recentRows] = await Promise.all([
    getContributorScores(connectionString, config.contributor_id),
    listEpochs(connectionString),
    sql`
      SELECT session_id, subject, information_value_score, ivs_breakdown
      FROM sessions
      WHERE contributor_id = ${config.contributor_id}
        AND information_value_score IS NOT NULL
      ORDER BY ended_at DESC
      LIMIT 5
    `,
  ])

  const recentSessions: IVSSessionRow[] = recentRows.map(r => ({
    session_id: r.session_id as string,
    subject: r.subject as string | null,
    information_value_score: r.information_value_score as number,
    ivs_breakdown: r.ivs_breakdown ? r.ivs_breakdown as IVSBreakdown : null,
  }))

  return {
    contributorId: config.contributor_id,
    walletAddress: config.wallet_address ?? null,
    paraWallet: config.para_wallet ?? null,
    worldIdVerified: !!config.world_id,
    currentEpoch: currentEpoch(),
    totalScore: scores.total,
    scoresByEpoch: scores.byEpoch,
    epochs,
    recentSessions,
  }
}

export function renderEarnings(data: EarningsData): string {
  const lines: string[] = []

  // Header
  lines.push('Pollen Earnings')
  lines.push('===============')
  lines.push('')

  // Identity
  lines.push(`  Contributor:  ${data.contributorId.slice(0, 8)}...`)
  lines.push(`  World ID:     ${data.worldIdVerified ? '\u2713 verified' : '\u2717 not verified (run pollen verify)'}`)
  const walletDisplay = data.paraWallet
    ? `${data.paraWallet.address} (${data.paraWallet.email})`
    : data.walletAddress ?? 'not set (run pollen wallet)'
  lines.push(`  Wallet:       ${walletDisplay}`)
  lines.push('')

  // Score summary + emission info
  const pool = epochPool(data.currentEpoch)
  const poolTokens = Number(pool / 10n ** 18n).toLocaleString()
  lines.push(`  Total IVS:     ${data.totalScore.toLocaleString()}`)
  lines.push(`  Current Epoch: ${data.currentEpoch}`)
  lines.push(`  Epoch Pool:    ${poolTokens} POLLEN (halves every 13 epochs)`)
  lines.push('')

  // Scores by epoch
  if (data.scoresByEpoch.length > 0) {
    lines.push('Scores by Epoch')
    lines.push('---------------')

    const maxScore = Math.max(...data.scoresByEpoch.map(e => e.score))
    const epochMap = new Map(data.epochs.map(e => [e.epoch_id, e]))

    for (const { epoch, score } of data.scoresByEpoch) {
      const epochInfo = epochMap.get(epoch)
      const status = epochInfo ? statusIcon(epochInfo.status) : '\u25cb'
      const b = bar(score / maxScore, 15)
      const claimable = epochInfo?.merkle_root
        ? '  [claimable]'
        : epoch < data.currentEpoch
          ? '  [pending close]'
          : '  [accumulating]'

      lines.push(`  ${status} ${epochLabel(epoch).padEnd(40)} ${String(score).padStart(6)}  ${b}${claimable}`)
    }
    lines.push('')
  } else {
    lines.push('  No sessions scored yet. Use Claude Code to start earning!')
    lines.push('')
  }

  // Claiming eligibility
  if (!data.worldIdVerified) {
    lines.push('  \u26a0  World ID required to claim tokens. Run: pollen verify')
  }
  if (!data.walletAddress && !data.paraWallet) {
    lines.push('  \u26a0  Wallet required to claim tokens. Run: pollen wallet')
  }

  // IVS breakdown for recent sessions
  if (data.recentSessions.length > 0) {
    lines.push('Recent Session Scores (IVS)')
    lines.push('===========================')
    for (const s of data.recentSessions) {
      const subj = s.subject ? `"${s.subject}"` : '(no subject)'
      lines.push(`  ${subj.padEnd(35)} IVS: ${s.information_value_score}`)
      if (s.ivs_breakdown) {
        const b = s.ivs_breakdown
        lines.push(`    Subject:  ${b.subject.toFixed(2)}  Topic:    ${b.topicAction.toFixed(2)}  Tools: ${b.tools.toFixed(2)}`)
        lines.push(`    Commands: ${b.commands.toFixed(2)}  Freshness:${b.freshness.toFixed(2)}  Depth: ${b.depth.toFixed(2)}`)
        if (b.authenticityMultiplier < 1.0) {
          lines.push(`    Entropy:  ${b.sequenceEntropy.toFixed(1)} bits  Multiplier: ${b.authenticityMultiplier}x`)
        }
      }
    }
    lines.push('')
  }

  // Published epochs (claimable)
  const claimable = data.epochs.filter(e => e.status === 'published')
  if (claimable.length > 0) {
    lines.push('')
    lines.push('Claimable Epochs')
    lines.push('----------------')
    for (const epoch of claimable) {
      const userScore = data.scoresByEpoch.find(e => e.epoch === epoch.epoch_id)?.score ?? 0
      lines.push(`  \u2713 ${epochLabel(epoch.epoch_id).padEnd(40)} ${String(userScore).padStart(6)} IVS`)
    }
    lines.push('')
    lines.push('  Run: pollen claim')
  }

  lines.push('')
  return lines.join('\n')
}
