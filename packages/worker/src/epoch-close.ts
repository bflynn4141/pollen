import { getDb } from '@pollen/data'
import { getAddress, verifyMessage, type Hex } from 'viem'

/**
 * Epoch-close scoring v2 — authenticated network receipts are the production
 * source of truth. Raw local sessions and tool events never participate in
 * scoring.
 *
 * Writes `epoch_scores` for the just-closed epoch. EPOCH_ZERO (2026-02-24
 * 00:00 UTC) is a TUESDAY, so epochs close Tuesday 00:00 UTC and the cron
 * runs Tuesdays 00:10 UTC ("10 0 * * 2"). The logic is robust to fire time
 * regardless: it always scores epoch = currentEpoch() - 1 and no-ops (with a
 * clear JSON message) if that epoch is already scored. Idempotent
 * (ON CONFLICT DO UPDATE) — pass `force` to recompute an already-scored
 * epoch, `epoch` to backfill a specific closed epoch.
 *
 * Formula (deliberately simple and bounded, not IVS):
 *   receipt_points = 1
 *     + terminal: completed .5, abandoned/error .25
 *     + check-run: passed/failed .5, not_run/unknown 0
 *     + duration: quick 0, short .1, medium .2, long/marathon .25
 *     + min(tool sequence length, 12) / 24
 *   score = min(active_days * 10 + sum(receipt_points), 224)
 *
 * At most the eight highest-value receipts per contributor per UTC day count.
 * Across a seven-day epoch that is at most 56 receipts. Tool depth stops at 12
 * steps per receipt, and long/marathon duration have the same weight. A failed
 * check is worth the same as a passed check: both are useful evidence that a
 * check ran, without penalising honest failure data. Intent, agent, and model
 * diversity are recorded in the breakdown but deliberately do not change pay;
 * rewarding client-declared labels would be trivial to farm and would bias pay
 * toward particular vendors or kinds of work.
 */

// Epoch math mirrors packages/cli/src/credits.ts:
// epoch 1 starts 2026-02-24 (Tuesday) UTC, 7-day epochs, 1-based.
const EPOCH_ORIGIN = Date.UTC(2026, 1, 24)
const EPOCH_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/** Execution quorum mirrored by packages/agent/src/payout.ts. */
export const MIN_PAYOUT_ELIGIBLE_CONTRIBUTORS = 5

export const SCORING_V2 = Object.freeze({
  activeDayPoints: 10,
  receiptsPerDay: 8,
  toolStepsPerReceipt: 12,
  baseReceiptPoints: 1,
  maxReceiptPoints: 2.75,
  maxEpochScore: 224,
  terminal: Object.freeze({ completed: 0.5, abandoned: 0.25, error_exit: 0.25 }),
  check: Object.freeze({ passed: 0.5, failed: 0.5, not_run: 0, unknown: 0 }),
  duration: Object.freeze({ quick: 0, short: 0.1, medium: 0.2, long: 0.25, marathon: 0.25 }),
})

export interface ScoringReceiptV2 {
  intent: string
  agent: string
  model: string
  tool_category_sequence: string[]
  duration_bucket: string
  terminal_state: string
  check_result: string
}

/** Pure mirror of the SQL receipt component, exported for auditability/tests. */
export function receiptPointsV2(receipt: ScoringReceiptV2): number {
  const terminal = SCORING_V2.terminal[receipt.terminal_state as keyof typeof SCORING_V2.terminal] ?? 0
  const check = SCORING_V2.check[receipt.check_result as keyof typeof SCORING_V2.check] ?? 0
  const duration = SCORING_V2.duration[receipt.duration_bucket as keyof typeof SCORING_V2.duration] ?? 0
  const toolSteps = Math.min(receipt.tool_category_sequence.length, SCORING_V2.toolStepsPerReceipt)
  return SCORING_V2.baseReceiptPoints + terminal + check + duration + toolSteps / 24
}

export function currentEpoch(): number {
  return Math.floor((Date.now() - EPOCH_ORIGIN) / EPOCH_DURATION_MS) + 1
}

export function epochBounds(epoch: number): { startsAt: number; endsAt: number } {
  const startsAt = EPOCH_ORIGIN + (epoch - 1) * EPOCH_DURATION_MS
  return { startsAt, endsAt: startsAt + EPOCH_DURATION_MS }
}

export interface EpochCloseOutcome {
  status: number
  body: Record<string, unknown>
}

export interface EpochHealth {
  epoch: number
  source: 'network_receipts'
  formula: 'v2-network-receipts'
  window: { starts_at: number; ends_at: number }
  contributors: number
  payout_eligible_contributors: number
  required_payout_eligible_contributors: number
  receipts: number
  active_registered_contributors: number
  epoch_scores: number
  payout_ready: boolean
  healthy: boolean
}

/** Aggregate-only diagnostics for the protected production health endpoint. */
export async function getEpochHealth(epoch = currentEpoch() - 1): Promise<EpochHealth> {
  const lastClosed = currentEpoch() - 1
  if (!Number.isInteger(epoch) || epoch < 1 || epoch > lastClosed) {
    throw new Error(`epoch must be an integer between 1 and ${lastClosed}`)
  }
  const { startsAt, endsAt } = epochBounds(epoch)
  const sql = getDb()
  const rows = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM contributors) AS contributors,
      (SELECT COUNT(*)::int FROM network_receipts
        WHERE observed_at >= ${startsAt} AND observed_at < ${endsAt}
      ) AS receipts,
      (SELECT COUNT(DISTINCT c.contributor_id)::int
        FROM contributors c
        WHERE EXISTS (
          SELECT 1 FROM network_receipts r
          WHERE r.contributor_id = c.contributor_id
            AND r.observed_at >= ${startsAt} AND r.observed_at < ${endsAt}
        )
      ) AS active_registered_contributors,
      (SELECT COUNT(*)::int FROM epoch_scores WHERE epoch = ${epoch}) AS epoch_scores
  `
  // Match the payout agent's fetchEligibleScores boundary exactly: candidates
  // must have a score for this epoch and all identity fields, then their
  // EIP-191 wallet binding is verified in application code. A non-null or
  // malformed signature does not count toward payout readiness.
  const payoutCandidates = await sql`
    SELECT es.contributor_id, c.wallet_address, c.wallet_binding_sig
    FROM epoch_scores es
    JOIN contributors c ON c.contributor_id = es.contributor_id
    WHERE es.epoch = ${epoch}
      AND c.world_id_nullifier IS NOT NULL
      AND c.verified_at IS NOT NULL
      AND c.wallet_address IS NOT NULL
      AND c.wallet_binding_sig IS NOT NULL
    ORDER BY es.contributor_id
  `
  const validBindings = await Promise.all(payoutCandidates.map(async candidate => {
    try {
      return await verifyMessage({
        address: getAddress(candidate.wallet_address as string),
        message: `pollen:register:${candidate.contributor_id as string}`,
        signature: candidate.wallet_binding_sig as Hex,
      })
    } catch {
      return false
    }
  }))
  const row = rows[0] ?? {}
  const payoutEligibleContributors = validBindings.filter(Boolean).length
  const health = {
    epoch,
    source: 'network_receipts' as const,
    formula: 'v2-network-receipts' as const,
    window: { starts_at: startsAt, ends_at: endsAt },
    contributors: Number(row.contributors ?? 0),
    payout_eligible_contributors: payoutEligibleContributors,
    required_payout_eligible_contributors: MIN_PAYOUT_ELIGIBLE_CONTRIBUTORS,
    receipts: Number(row.receipts ?? 0),
    active_registered_contributors: Number(row.active_registered_contributors ?? 0),
    epoch_scores: Number(row.epoch_scores ?? 0),
  }
  return {
    ...health,
    payout_ready: health.epoch_scores > 0 &&
      health.payout_eligible_contributors >= health.required_payout_eligible_contributors,
    healthy: health.active_registered_contributors > 0 && health.epoch_scores > 0,
  }
}

export async function runEpochClose(
  opts: { epoch?: number | null; force?: boolean } = {},
): Promise<EpochCloseOutcome> {
  const lastClosed = currentEpoch() - 1
  if (lastClosed < 1) {
    return { status: 400, body: { ok: false, error: 'no closed epoch yet' } }
  }

  // Default: the just-closed epoch. `epoch` allows backfilling any closed
  // epoch, but never the currently open one.
  const epoch = opts.epoch != null ? opts.epoch : lastClosed
  if (!Number.isInteger(epoch) || epoch < 1 || epoch > lastClosed) {
    return {
      status: 400,
      body: { ok: false, error: `epoch must be an integer between 1 and ${lastClosed} (last closed epoch)` },
    }
  }

  const { startsAt, endsAt } = epochBounds(epoch)
  const sql = getDb()
  const force = opts.force === true

  try {
    const started = Date.now()

    // No-op if this epoch is already scored (e.g. the cron fired twice, or
    // fired late and the epoch was scored manually). `force` recomputes.
    if (!force) {
      const existing = await sql`
        SELECT COUNT(*)::int AS n FROM epoch_scores WHERE epoch = ${epoch}
      `
      const n = Number(existing[0]?.n ?? 0)
      if (n > 0) {
        return {
          status: 200,
          body: {
            ok: true,
            epoch,
            skipped: true,
            reason: `epoch ${epoch} already scored (${n} contributors) — pass force to recompute`,
          },
        }
      }
    }
    const rows = await sql`
      WITH receipt_values AS (
        SELECT
          r.receipt_id,
          r.contributor_id,
          r.observed_at,
          r.intent,
          r.agent,
          r.model,
          r.terminal_state,
          r.check_result,
          FLOOR(r.observed_at / 86400000.0) AS activity_day,
          LEAST(CARDINALITY(r.tool_category_sequence), ${SCORING_V2.toolStepsPerReceipt})::numeric AS tool_steps_capped,
          (
            ${SCORING_V2.baseReceiptPoints}::numeric
            + CASE r.terminal_state
                WHEN 'completed' THEN ${SCORING_V2.terminal.completed}::numeric
                WHEN 'abandoned' THEN ${SCORING_V2.terminal.abandoned}::numeric
                WHEN 'error_exit' THEN ${SCORING_V2.terminal.error_exit}::numeric
                ELSE 0
              END
            + CASE r.check_result
                WHEN 'passed' THEN ${SCORING_V2.check.passed}::numeric
                WHEN 'failed' THEN ${SCORING_V2.check.failed}::numeric
                WHEN 'not_run' THEN ${SCORING_V2.check.not_run}::numeric
                WHEN 'unknown' THEN ${SCORING_V2.check.unknown}::numeric
                ELSE 0
              END
            + CASE r.duration_bucket
                WHEN 'quick' THEN ${SCORING_V2.duration.quick}::numeric
                WHEN 'short' THEN ${SCORING_V2.duration.short}::numeric
                WHEN 'medium' THEN ${SCORING_V2.duration.medium}::numeric
                WHEN 'long' THEN ${SCORING_V2.duration.long}::numeric
                WHEN 'marathon' THEN ${SCORING_V2.duration.marathon}::numeric
                ELSE 0
              END
            + LEAST(CARDINALITY(r.tool_category_sequence), ${SCORING_V2.toolStepsPerReceipt})::numeric / 24.0
          ) AS receipt_points
        FROM network_receipts r
        INNER JOIN contributors c ON c.contributor_id = r.contributor_id
        WHERE r.observed_at >= ${startsAt} AND r.observed_at < ${endsAt}
      ),
      ranked_receipts AS (
        SELECT *,
               ROW_NUMBER() OVER (
                 PARTITION BY contributor_id, activity_day
                 ORDER BY receipt_points DESC, observed_at, receipt_id
               ) AS daily_rank
        FROM receipt_values
      ),
      capped_receipts AS (
        SELECT * FROM ranked_receipts
        WHERE daily_rank <= ${SCORING_V2.receiptsPerDay}
      ),
      components AS (
        SELECT
          contributor_id,
          COUNT(DISTINCT activity_day)::numeric AS active_days,
          COUNT(*)::int AS receipts_scored,
          COUNT(DISTINCT intent)::int AS distinct_intents,
          COUNT(DISTINCT agent)::int AS distinct_agents,
          COUNT(DISTINCT model)::int AS distinct_models,
          SUM(tool_steps_capped)::numeric AS tool_steps_capped,
          SUM(receipt_points)::numeric AS receipt_points,
          COUNT(*) FILTER (WHERE terminal_state = 'completed')::int AS completed_receipts,
          COUNT(*) FILTER (WHERE check_result IN ('passed', 'failed'))::int AS checked_receipts
        FROM capped_receipts
        GROUP BY contributor_id
      ),
      upserted AS (
        INSERT INTO epoch_scores (epoch, contributor_id, score, breakdown, computed_at)
        SELECT
          ${epoch},
          contributor_id,
          ROUND(LEAST(active_days * ${SCORING_V2.activeDayPoints} + receipt_points, ${SCORING_V2.maxEpochScore}::numeric), 4),
          jsonb_build_object(
            'formula', 'v2-network-receipts',
            'active_days', active_days,
            'receipts_scored', receipts_scored,
            'receipt_points', ROUND(receipt_points, 4),
            'tool_steps_capped', tool_steps_capped,
            'completed_receipts', completed_receipts,
            'checked_receipts', checked_receipts,
            'distinct_intents', distinct_intents,
            'distinct_agents', distinct_agents,
            'distinct_models', distinct_models,
            'caps', jsonb_build_object(
              'receipts_per_day', ${SCORING_V2.receiptsPerDay}::int,
              'tool_steps_per_receipt', ${SCORING_V2.toolStepsPerReceipt}::int,
              'max_epoch_score', ${SCORING_V2.maxEpochScore}::numeric
            )
          ),
          NOW()
        FROM components
        ON CONFLICT (epoch, contributor_id) DO UPDATE SET
          score = EXCLUDED.score,
          breakdown = EXCLUDED.breakdown,
          computed_at = EXCLUDED.computed_at
        RETURNING contributor_id
      ),
      removed AS (
        DELETE FROM epoch_scores scores
        WHERE ${force}::boolean
          AND scores.epoch = ${epoch}
          AND NOT EXISTS (
            SELECT 1 FROM components
            WHERE components.contributor_id = scores.contributor_id
          )
        RETURNING contributor_id
      )
      SELECT contributor_id, 'scored' AS action FROM upserted
      UNION ALL
      SELECT contributor_id, 'removed' AS action FROM removed
    `
    const scored = rows.filter(row => row.action !== 'removed').length
    const removed = rows.filter(row => row.action === 'removed').length
    return {
      status: 200,
      body: {
        ok: true,
        epoch,
        window: { starts_at: startsAt, ends_at: endsAt },
        formula: 'v2-network-receipts',
        scored,
        removed,
        ms: Date.now() - started,
      },
    }
  } catch (err) {
    return {
      status: 500,
      body: { ok: false, error: err instanceof Error ? err.message : String(err) },
    }
  }
}
