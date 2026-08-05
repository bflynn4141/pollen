import { getDb } from '@pollen/data'

/**
 * Epoch-close scoring v1 — ported unchanged from the site's
 * /api/cron/epoch-close route (Vercel crons moved to this worker).
 *
 * Writes `epoch_scores` for the just-closed epoch. EPOCH_ZERO (2026-02-24
 * 00:00 UTC) is a TUESDAY, so epochs close Tuesday 00:00 UTC and the cron
 * runs Tuesdays 00:10 UTC ("10 0 * * 2"). The logic is robust to fire time
 * regardless: it always scores epoch = currentEpoch() - 1 and no-ops (with a
 * clear JSON message) if that epoch is already scored. Idempotent
 * (ON CONFLICT DO UPDATE) — pass `force` to recompute an already-scored
 * epoch, `epoch` to backfill a specific closed epoch.
 *
 * Formula (deliberately simple, documented, not IVS):
 *   score = (active_days * 10
 *            + min(weighted_sessions, 21) * 3
 *            + min(tool_events, 2000) / 100)
 *           * clamp(0.5 + avg_satisfaction / 200, 0.5, 1.0)
 *
 * Anti-farm caps: tool events capped at 200/contributor/day before the 2000
 * total cap; sessions weighted 1.0 when outcome='completed', 0.25 when
 * 'abandoned', 0 otherwise (e.g. 'error_exit'). Missing satisfaction data
 * gets a neutral 0.75 multiplier. Only contributors present in the
 * `contributors` table are scored. Each component is stored in `breakdown`
 * for transparency (`pollen earnings` renders it).
 */

// Epoch math mirrors packages/cli/src/credits.ts:
// epoch 1 starts 2026-02-24 (Tuesday) UTC, 7-day epochs, 1-based.
const EPOCH_ORIGIN = Date.UTC(2026, 1, 24)
const EPOCH_DURATION_MS = 7 * 24 * 60 * 60 * 1000

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
  window: { starts_at: number; ends_at: number }
  contributors: number
  payout_eligible_contributors: number
  tool_events: number
  attributed_tool_events: number
  sessions: number
  attributed_sessions: number
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
      (SELECT COUNT(*)::int FROM contributors
        WHERE world_id_nullifier IS NOT NULL AND verified_at IS NOT NULL
          AND wallet_address IS NOT NULL AND wallet_binding_sig IS NOT NULL
      ) AS payout_eligible_contributors,
      (SELECT COUNT(*)::int FROM tool_events
        WHERE timestamp >= ${startsAt} AND timestamp < ${endsAt}
      ) AS tool_events,
      (SELECT COUNT(*)::int FROM tool_events
        WHERE contributor_id IS NOT NULL AND timestamp >= ${startsAt} AND timestamp < ${endsAt}
      ) AS attributed_tool_events,
      (SELECT COUNT(*)::int FROM sessions
        WHERE started_at >= ${startsAt} AND started_at < ${endsAt}
      ) AS sessions,
      (SELECT COUNT(*)::int FROM sessions
        WHERE contributor_id IS NOT NULL AND started_at >= ${startsAt} AND started_at < ${endsAt}
      ) AS attributed_sessions,
      (SELECT COUNT(DISTINCT c.contributor_id)::int
        FROM contributors c
        WHERE EXISTS (
          SELECT 1 FROM tool_events t
          WHERE t.contributor_id = c.contributor_id
            AND t.timestamp >= ${startsAt} AND t.timestamp < ${endsAt}
        ) OR EXISTS (
          SELECT 1 FROM sessions s
          WHERE s.contributor_id = c.contributor_id
            AND s.started_at >= ${startsAt} AND s.started_at < ${endsAt}
        )
      ) AS active_registered_contributors,
      (SELECT COUNT(*)::int FROM epoch_scores WHERE epoch = ${epoch}) AS epoch_scores
  `
  const row = rows[0] ?? {}
  const health = {
    epoch,
    window: { starts_at: startsAt, ends_at: endsAt },
    contributors: Number(row.contributors ?? 0),
    payout_eligible_contributors: Number(row.payout_eligible_contributors ?? 0),
    tool_events: Number(row.tool_events ?? 0),
    attributed_tool_events: Number(row.attributed_tool_events ?? 0),
    sessions: Number(row.sessions ?? 0),
    attributed_sessions: Number(row.attributed_sessions ?? 0),
    active_registered_contributors: Number(row.active_registered_contributors ?? 0),
    epoch_scores: Number(row.epoch_scores ?? 0),
  }
  return {
    ...health,
    payout_ready: health.epoch_scores > 0 && health.payout_eligible_contributors > 0,
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
      WITH tool_days AS (
        -- Anti-farm cap: at most 200 tool events count per contributor per day
        SELECT contributor_id,
               LEAST(COUNT(*), 200) AS capped_events
        FROM tool_events
        WHERE contributor_id IS NOT NULL
          AND timestamp >= ${startsAt} AND timestamp < ${endsAt}
        GROUP BY contributor_id, FLOOR(timestamp / 86400000.0)
      ),
      tool_agg AS (
        SELECT contributor_id,
               COUNT(*)::int AS active_days,
               LEAST(SUM(capped_events), 2000)::numeric AS tool_events
        FROM tool_days
        GROUP BY contributor_id
      ),
      session_agg AS (
        -- completed sessions count at full weight, abandoned at 0.25,
        -- everything else (error_exit, NULL) at 0
        SELECT contributor_id,
               LEAST(SUM(CASE WHEN outcome = 'completed' THEN 1.0
                              WHEN outcome = 'abandoned' THEN 0.25
                              ELSE 0 END), 21)::numeric AS weighted_sessions,
               AVG(satisfaction_score)::numeric AS avg_satisfaction
        FROM sessions
        WHERE contributor_id IS NOT NULL
          AND started_at >= ${startsAt} AND started_at < ${endsAt}
        GROUP BY contributor_id
      ),
      components AS (
        -- Only contributors registered in the contributors table are scored
        SELECT c.contributor_id,
               COALESCE(t.active_days, 0) AS active_days,
               COALESCE(s.weighted_sessions, 0) AS weighted_sessions,
               COALESCE(t.tool_events, 0) AS tool_events,
               s.avg_satisfaction,
               LEAST(GREATEST(0.5 + COALESCE(s.avg_satisfaction, 50) / 200.0, 0.5), 1.0) AS quality_multiplier
        FROM contributors c
        LEFT JOIN tool_agg t ON t.contributor_id = c.contributor_id
        LEFT JOIN session_agg s ON s.contributor_id = c.contributor_id
        WHERE t.contributor_id IS NOT NULL OR s.contributor_id IS NOT NULL
      )
      INSERT INTO epoch_scores (epoch, contributor_id, score, breakdown, computed_at)
      SELECT
        ${epoch},
        contributor_id,
        ROUND((active_days * 10 + weighted_sessions * 3 + tool_events / 100.0) * quality_multiplier, 4),
        jsonb_build_object(
          'formula', 'v1',
          'active_days', active_days,
          'weighted_sessions', weighted_sessions,
          'tool_events_capped', tool_events,
          'avg_satisfaction', ROUND(avg_satisfaction, 2),
          'quality_multiplier', ROUND(quality_multiplier, 4),
          'base_score', ROUND(active_days * 10 + weighted_sessions * 3 + tool_events / 100.0, 4)
        ),
        NOW()
      FROM components
      ON CONFLICT (epoch, contributor_id) DO UPDATE SET
        score = EXCLUDED.score,
        breakdown = EXCLUDED.breakdown,
        computed_at = EXCLUDED.computed_at
      RETURNING contributor_id
    `
    return {
      status: 200,
      body: {
        ok: true,
        epoch,
        window: { starts_at: startsAt, ends_at: endsAt },
        scored: rows.length,
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
