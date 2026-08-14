import { neon } from '@neondatabase/serverless'

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
}

export interface ContributionHealth {
  registered_contributors: number
  active_tokens: number
  receipts_24h: number
  contributors_24h: number
  last_receipt_at: string | Date | null
  active_invites: number
  receipt_rollup_cells: number
  last_rollup_at: string | Date | null
}

export interface OperationsDependencies {
  readHealth(): Promise<ContributionHealth>
}

export async function handleContributionHealth(
  deps: OperationsDependencies,
): Promise<Response> {
  const health = await deps.readHealth()
  const status = health.receipts_24h > 0
    ? 'healthy'
    : health.registered_contributors > 0 ? 'idle' : 'empty'
  return new Response(JSON.stringify({
    status,
    contributors: {
      registered: health.registered_contributors,
      active_tokens: health.active_tokens,
    },
    ingest: {
      receipts_24h: health.receipts_24h,
      contributors_24h: health.contributors_24h,
      last_receipt_at: health.last_receipt_at,
    },
    onboarding: { active_invites: health.active_invites },
    publishing: {
      receipt_rollup_cells: health.receipt_rollup_cells,
      last_rollup_at: health.last_rollup_at,
    },
  }), { status: 200, headers: JSON_HEADERS })
}

export function createOperationsDependencies(databaseUrl: string): OperationsDependencies {
  const sql = neon(databaseUrl)
  return {
    async readHealth() {
      const rows = await sql`
        SELECT
          (SELECT COUNT(*)::int FROM contributors) AS registered_contributors,
          (SELECT COUNT(*)::int FROM contributor_api_tokens WHERE revoked_at IS NULL) AS active_tokens,
          (SELECT COUNT(*)::int FROM network_receipts WHERE received_at >= NOW() - INTERVAL '24 hours') AS receipts_24h,
          (SELECT COUNT(DISTINCT contributor_id)::int FROM network_receipts WHERE received_at >= NOW() - INTERVAL '24 hours') AS contributors_24h,
          (SELECT MAX(received_at) FROM network_receipts) AS last_receipt_at,
          (SELECT COUNT(*)::int FROM contributor_invites WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()) AS active_invites,
          (SELECT COUNT(*)::int FROM rollup_cells WHERE rollup LIKE 'receipt_%') AS receipt_rollup_cells,
          (SELECT MAX(computed_at) FROM rollup_cells WHERE rollup LIKE 'receipt_%') AS last_rollup_at`
      const row = rows[0]
      return {
        registered_contributors: Number(row?.registered_contributors ?? 0),
        active_tokens: Number(row?.active_tokens ?? 0),
        receipts_24h: Number(row?.receipts_24h ?? 0),
        contributors_24h: Number(row?.contributors_24h ?? 0),
        last_receipt_at: (row?.last_receipt_at as string | Date | null) ?? null,
        active_invites: Number(row?.active_invites ?? 0),
        receipt_rollup_cells: Number(row?.receipt_rollup_cells ?? 0),
        last_rollup_at: (row?.last_rollup_at as string | Date | null) ?? null,
      }
    },
  }
}
