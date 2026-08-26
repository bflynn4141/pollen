import { Hono } from 'hono'
import type { Context } from 'hono'
import {
  K_ANONYMITY,
  computeRollups,
  configureDb,
  listReceiptWeeks,
  listWeeks,
  readExport,
  readGrid,
  readMcpHistory,
  readMcpRanking,
  readOverview,
  readReceiptNetwork,
  readReceiptNetworkWindows,
  readToolHistory,
  readTrendingTools,
} from '@pollen/data'
import { getEpochHealth, runEpochClose } from './epoch-close'
import { createBuyerCatalog, unpublishedPaidResult } from './buyer-catalog'
import {
  createActiveRevenueClaimStore,
  handleActiveRevenueClaims,
} from './active-revenue-claims'
import { createPollenPaymentMiddleware, getRelayerHealth, type X402RelayEnv } from './x402-relay'
import {
  handleRpSignature,
  handleWorldIdVerify,
  type WorldIdEnv,
} from './worldid'
import {
  createIngestDependencies,
  handleContributorRegistration,
  handleContributorDeletion,
  handleContributorStatus,
  handleReceiptIngest,
} from './ingest'
import {
  createInviteDependencies,
  handleCreateInvite,
  handleListInvites,
  handleRevokeInvite,
} from './invites'
import {
  createOperationsDependencies,
  handleContributionHealth,
} from './operations'
export { X402SettlementRelayer } from './x402-relay'

/**
 * pollen-api — Cloudflare Worker serving the public /api/v1 endpoints at
 * api.pollen.id, plus the two cron jobs that used to be Vercel crons
 * (rollups every 15m, epoch-close Tuesdays 00:10 UTC).
 *
 * k-anonymity boundary: route handlers import ONLY the @pollen/data readers
 * (rollup_cells); never the site's raw-table queries. computeRollups() (cron/
 * admin only) is the single raw-table path and suppresses cells below K=5 at
 * write time.
 *
 * Paid endpoints are gated by x402 (USDC on Base) and relayed through
 * PollenSettlementV2. Free endpoints send `public, max-age=300`; paid
 * endpoints send `no-store`.
 */

export interface Env extends X402RelayEnv, WorldIdEnv {
  // Secrets (wrangler secret put):
  NEON_DATABASE_URL: string
  ADMIN_SECRET: string
  /** Set to `live` only after the separately approved V3 settlement cutover. */
  ACTIVE_REVENUE_CUTOVER_STATUS?: string
}

const FREE_CACHE = { 'Cache-Control': 'public, max-age=300' }
const NO_STORE = { 'Cache-Control': 'no-store' }

const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
  configureDb(c.env.NEON_DATABASE_URL)
  return next()
})
app.use('*', createPollenPaymentMiddleware())

// ── API endpoints (mounted at both / and /api/v1) ──

const api = new Hono<{ Bindings: Env }>()

// Free, machine-readable product contract. Buyers can inspect the schema,
// prices, privacy boundary, and x402 v2 headers before authorizing payment.
api.get('/catalog', c =>
  c.json(createBuyerCatalog(new URL(c.req.url).origin), 200, FREE_CACHE),
)

// Identity endpoints are uncached and never x402-gated. The signing key stays
// in the Worker; clients receive only a short-lived request signature.
api.post('/worldid/rp-signature', c => handleRpSignature(c.env))
api.post('/worldid/verify', c => handleWorldIdVerify(c.req.raw, c.env))

// Founding-panel write boundary. Registration is invite-gated; subsequent
// uploads use the one-time bearer token issued to that installation. Only the
// closed receipt schema in ingest.ts can cross this boundary.
api.post('/contributors/register', async c => {
  const invite = c.req.header('x-pollen-invite') ?? ''
  let contributorId: string | undefined
  const rawBody = await c.req.text()
  if (rawBody) {
    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return c.json({ error: 'invalid_json' }, 400, NO_STORE)
    }
    if (
      typeof body !== 'object'
      || body === null
      || Array.isArray(body)
      || Object.keys(body).some(key => key !== 'contributor_id')
      || typeof (body as Record<string, unknown>).contributor_id !== 'string'
    ) {
      return c.json({ error: 'invalid_registration' }, 400, NO_STORE)
    }
    contributorId = (body as { contributor_id: string }).contributor_id
  }
  return handleContributorRegistration(
    invite,
    createIngestDependencies(c.env.NEON_DATABASE_URL),
    contributorId,
  )
})
api.get('/contributors/me', c =>
  handleContributorStatus(c.req.raw, createIngestDependencies(c.env.NEON_DATABASE_URL)),
)
api.delete('/contributors/me', async c => {
  const response = await handleContributorDeletion(
    c.req.raw,
    createIngestDependencies(c.env.NEON_DATABASE_URL),
  )
  if (!response.ok) return response
  try {
    await computeRollups()
    return response
  } catch {
    return c.json({ deleted: true, rollups: 'pending' }, 202, NO_STORE)
  }
})
api.post('/receipts', c =>
  handleReceiptIngest(c.req.raw, createIngestDependencies(c.env.NEON_DATABASE_URL)),
)

// Free: latest two published weeks, k-anonymized rollup cells only.
api.get('/trending/tools', async c => {
  const weeks = (await listWeeks()).slice(0, 2)
  const data = await Promise.all(
    weeks.map(async week => ({ week, tools: await readTrendingTools(week) })),
  )
  return c.json({ k_anonymity: K_ANONYMITY, weeks: data }, 200, FREE_CACHE)
})

api.get('/trending/mcp', async c => {
  const weeks = (await listWeeks()).slice(0, 2)
  const data = await Promise.all(
    weeks.map(async week => ({ week, servers: await readMcpRanking(week) })),
  )
  return c.json({ k_anonymity: K_ANONYMITY, weeks: data }, 200, FREE_CACHE)
})

api.get('/overview', async c => {
  const weeks = (await listWeeks()).slice(0, 2)
  const data = await Promise.all(weeks.map(week => readOverview(week)))
  return c.json({ k_anonymity: K_ANONYMITY, weeks: data.filter(Boolean) }, 200, FREE_CACHE)
})

// Free: privacy-closed production receipt snapshot. Until at least K distinct
// contributors qualify in one week, this intentionally returns an empty list.
api.get('/network', async c => {
  const weeks = (await listReceiptWeeks()).slice(0, 2)
  const [data, windows] = await Promise.all([
    Promise.all(weeks.map(week => readReceiptNetwork(week))),
    readReceiptNetworkWindows(),
  ])
  const live = Object.values(windows).some(window => window.current !== null)
  return c.json({
    source: 'network_receipts',
    k_anonymity: K_ANONYMITY,
    status: live ? 'live' : 'warming_up',
    windows,
    weeks: data.filter(Boolean),
  }, 200, FREE_CACHE)
})

// Free public claim material. Before an approved V3 cutover this accurately
// reports `planned`, even if draft allocation rows exist.
api.get('/active-revenue/claims/:wallet', c =>
  handleActiveRevenueClaims(
    c.req.param('wallet'),
    createActiveRevenueClaimStore(c.env.NEON_DATABASE_URL),
    c.env.ACTIVE_REVENUE_CUTOVER_STATUS === 'live' ? 'live' : 'planned',
  ),
)

// Paid ($0.01): full weekly history for one tool. Never cached.
api.get('/tools/history', async c => {
  const tool = c.req.query('tool')
  if (!tool) {
    return c.json({ error: 'missing required query param: tool' }, 400, NO_STORE)
  }
  const history = await readToolHistory(tool)
  if (history.length === 0) {
    return c.json(unpublishedPaidResult(`tool ${tool}`), 425, NO_STORE)
  }
  return c.json({ k_anonymity: K_ANONYMITY, tool, history }, 200, NO_STORE)
})

// Paid ($0.01): full weekly history for one MCP server. Never cached.
api.get('/mcp/history', async c => {
  const server = c.req.query('server')
  if (!server) {
    return c.json({ error: 'missing required query param: server' }, 400, NO_STORE)
  }
  const history = await readMcpHistory(server)
  if (history.length === 0) {
    return c.json(unpublishedPaidResult(`MCP server ${server}`), 425, NO_STORE)
  }
  return c.json({ k_anonymity: K_ANONYMITY, server, history }, 200, NO_STORE)
})

// Paid ($0.05): full tool x week and server x week grid. Never cached.
api.get('/grid', async c => {
  const grid = await readGrid()
  if (grid.tools.length === 0 && grid.mcpServers.length === 0) {
    return c.json(unpublishedPaidResult('the grid'), 425, NO_STORE)
  }
  return c.json({ k_anonymity: K_ANONYMITY, ...grid }, 200, NO_STORE)
})

// Paid ($0.25): every published rollup cell. Never cached.
api.get('/export', async c => {
  const cells = await readExport()
  if (cells.length === 0) {
    return c.json(unpublishedPaidResult('the export'), 425, NO_STORE)
  }
  return c.json({ k_anonymity: K_ANONYMITY, count: cells.length, cells }, 200, NO_STORE)
})

app.route('/api/v1', api)
app.route('/', api)

// ── Index ──

app.get('/', c =>
  c.json(
    {
      name: 'pollen-api',
      docs: 'https://pollen.id/docs/api',
      k_anonymity: K_ANONYMITY,
      free: ['/catalog', '/trending/tools', '/trending/mcp', '/overview', '/network'],
      paid_x402: {
        '/tools/history?tool=<name>': '$0.01',
        '/mcp/history?server=<name>': '$0.01',
        '/grid': '$0.05',
        '/export': '$0.25',
      },
    },
    200,
    FREE_CACHE,
  ),
)

// ── Admin (manual cron triggers; Bearer ADMIN_SECRET) ──

function requireAdmin(c: Context<{ Bindings: Env }>): Response | null {
  const secret = c.env.ADMIN_SECRET
  const auth = c.req.header('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return c.json({ error: 'unauthorized' }, 401, NO_STORE)
  }
  return null
}

app.post('/admin/run/rollups', async c => {
  const denied = requireAdmin(c)
  if (denied) return denied
  try {
    const started = Date.now()
    const cells = await computeRollups()
    return c.json({ ok: true, cells, ms: Date.now() - started }, 200, NO_STORE)
  } catch (err) {
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
      NO_STORE,
    )
  }
})

app.post('/admin/invites', async c => {
  const denied = requireAdmin(c)
  if (denied) return denied
  return handleCreateInvite(c.req.raw, createInviteDependencies(c.env.NEON_DATABASE_URL))
})

app.get('/admin/invites', c => {
  const denied = requireAdmin(c)
  if (denied) return denied
  return handleListInvites(createInviteDependencies(c.env.NEON_DATABASE_URL))
})

app.post('/admin/invites/:id/revoke', async c => {
  const denied = requireAdmin(c)
  if (denied) return denied
  return handleRevokeInvite(
    c.req.raw,
    c.req.param('id'),
    createInviteDependencies(c.env.NEON_DATABASE_URL),
  )
})

app.get('/admin/contributions/health', c => {
  const denied = requireAdmin(c)
  if (denied) return denied
  return handleContributionHealth(createOperationsDependencies(c.env.NEON_DATABASE_URL))
})

app.post('/admin/run/epoch-close', async c => {
  const denied = requireAdmin(c)
  if (denied) return denied
  const epochParam = c.req.query('epoch')
  const result = await runEpochClose({
    epoch: epochParam != null ? Number(epochParam) : null,
    force: c.req.query('force') === '1',
  })
  return c.json(result.body, result.status as 200, NO_STORE)
})

app.get('/admin/health', async c => {
  const denied = requireAdmin(c)
  if (denied) return denied
  try {
    const epochParam = c.req.query('epoch')
    const [epoch, relayer] = await Promise.all([
      getEpochHealth(epochParam != null ? Number(epochParam) : undefined),
      getRelayerHealth(c.env),
    ])
    const healthy = epoch.healthy && relayer.healthy
    return c.json({ ok: healthy, epoch, relayer }, healthy ? 200 : 503, NO_STORE)
  } catch (err) {
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      500,
      NO_STORE,
    )
  }
})

// ── Cron triggers (wrangler.toml [triggers].crons) ──

async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  configureDb(env.NEON_DATABASE_URL)
  switch (controller.cron) {
    case '*/15 * * * *': {
      const cells = await computeRollups()
      console.log(`[cron rollups] wrote ${cells} cells`)
      break
    }
    // Keep the named weekday in sync with wrangler.toml. Cloudflare numbers
    // Sunday=1, so the formerly configured numeric 2 fired on Monday, before
    // Pollen's Tuesday epoch boundary.
    case '10 0 * * TUE': {
      const result = await runEpochClose()
      console.log(`[cron epoch-close] ${JSON.stringify(result.body)}`)
      if (result.status >= 500) throw new Error(`epoch-close failed: ${JSON.stringify(result.body)}`)
      const health = await getEpochHealth()
      if (!health.healthy) {
        console.error(`[cron epoch-health] ${JSON.stringify(health)}`)
      }
      break
    }
    default:
      console.warn(`[cron] unknown cron expression: ${controller.cron}`)
  }
}

export default {
  fetch: app.fetch,
  scheduled,
}
