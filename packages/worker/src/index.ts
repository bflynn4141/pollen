import { Hono } from 'hono'
import type { Context } from 'hono'
import { paymentMiddleware } from 'x402-hono'
import type { Network, RoutesConfig } from 'x402-hono'
import { createFacilitatorConfig } from '@coinbase/x402'
import {
  K_ANONYMITY,
  computeRollups,
  configureDb,
  listWeeks,
  readExport,
  readGrid,
  readMcpHistory,
  readMcpRanking,
  readOverview,
  readToolHistory,
  readTrendingTools,
} from '@pollen/data'
import { runEpochClose } from './epoch-close'

/**
 * pollen-api — Cloudflare Worker serving the public /api/v1 endpoints at
 * api.pollen.id, plus the two cron jobs that used to be Vercel crons
 * (rollups every 6h, epoch-close Tuesdays 00:10 UTC).
 *
 * k-anonymity boundary: route handlers import ONLY the @pollen/data readers
 * (rollup_cells); never the site's raw-table queries. computeRollups() (cron/
 * admin only) is the single raw-table path and suppresses cells below K=5 at
 * write time.
 *
 * Paid endpoints are gated by x402 (USDC on Base) via x402-hono. Free
 * endpoints send `public, max-age=300`; paid endpoints send `no-store`.
 */

export interface Env {
  // Secrets (wrangler secret put):
  NEON_DATABASE_URL: string
  ADMIN_SECRET: string
  CDP_API_KEY_ID?: string
  CDP_API_KEY_SECRET?: string
  // Vars (wrangler.toml [vars]):
  X402_PAY_TO?: string
  X402_NETWORK?: string
}

const FREE_CACHE = { 'Cache-Control': 'public, max-age=300' }
const NO_STORE = { 'Cache-Control': 'no-store' }

const PRICES: Record<string, string> = {
  '/tools/history': '$0.01',
  '/mcp/history': '$0.01',
  '/grid': '$0.05',
  '/export': '$0.25',
}

const DESCRIPTIONS: Record<string, string> = {
  '/tools/history': 'Full weekly history for one tool (k-anonymized, >=5 contributors per cell)',
  '/mcp/history': 'Full weekly history for one MCP server (k-anonymized, >=5 contributors per cell)',
  '/grid': 'Full tool x week and MCP-server x week grid, all published history',
  '/export': 'Full dump of every published rollup cell',
}

/**
 * Build the x402 middleware for this env. Canonical paths are the bare ones
 * (api.pollen.id/tools/history); the /api/v1-prefixed aliases are gated too.
 * Returns null when X402_PAY_TO is unset — paid routes are then served
 * unpaid (dev only; always set X402_PAY_TO in production).
 */
function buildX402(env: Env) {
  if (!env.X402_PAY_TO) return null
  const network: Network = env.X402_NETWORK === 'base' ? 'base' : 'base-sepolia'
  const routes: RoutesConfig = {}
  for (const [path, price] of Object.entries(PRICES)) {
    const config = { description: DESCRIPTIONS[path], mimeType: 'application/json' }
    routes[path] = { price, network, config }
    routes[`/api/v1${path}`] = { price, network, config }
  }
  // Mainnet settles through the Coinbase CDP facilitator (explicit keys, no
  // process.env reliance); base-sepolia uses x402-hono's default
  // https://x402.org/facilitator, which needs no credentials.
  const facilitator =
    network === 'base'
      ? createFacilitatorConfig(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET)
      : undefined
  return paymentMiddleware(env.X402_PAY_TO as `0x${string}`, routes, facilitator)
}

const app = new Hono<{ Bindings: Env }>()

// Wire the shared data layer to this request's env, then apply the x402 gate
// (built lazily because env bindings aren't available at module scope).
let x402: ReturnType<typeof buildX402> | undefined
app.use('*', async (c, next) => {
  configureDb(c.env.NEON_DATABASE_URL)
  if (x402 === undefined) x402 = buildX402(c.env)
  if (x402) return x402(c, next)
  return next()
})

// ── API endpoints (mounted at both / and /api/v1) ──

const api = new Hono<{ Bindings: Env }>()

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

// Paid ($0.01): full weekly history for one tool. Never cached.
api.get('/tools/history', async c => {
  const tool = c.req.query('tool')
  if (!tool) {
    return c.json({ error: 'missing required query param: tool' }, 400, NO_STORE)
  }
  const history = await readToolHistory(tool)
  return c.json({ k_anonymity: K_ANONYMITY, tool, history }, 200, NO_STORE)
})

// Paid ($0.01): full weekly history for one MCP server. Never cached.
api.get('/mcp/history', async c => {
  const server = c.req.query('server')
  if (!server) {
    return c.json({ error: 'missing required query param: server' }, 400, NO_STORE)
  }
  const history = await readMcpHistory(server)
  return c.json({ k_anonymity: K_ANONYMITY, server, history }, 200, NO_STORE)
})

// Paid ($0.05): full tool x week and server x week grid. Never cached.
api.get('/grid', async c => {
  const grid = await readGrid()
  return c.json({ k_anonymity: K_ANONYMITY, ...grid }, 200, NO_STORE)
})

// Paid ($0.25): every published rollup cell. Never cached.
api.get('/export', async c => {
  const cells = await readExport()
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
      free: ['/trending/tools', '/trending/mcp', '/overview'],
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

// ── Cron triggers (wrangler.toml [triggers].crons) ──

async function scheduled(controller: ScheduledController, env: Env): Promise<void> {
  configureDb(env.NEON_DATABASE_URL)
  switch (controller.cron) {
    case '0 */6 * * *': {
      const cells = await computeRollups()
      console.log(`[cron rollups] wrote ${cells} cells`)
      break
    }
    case '10 0 * * 2': {
      const result = await runEpochClose()
      console.log(`[cron epoch-close] ${JSON.stringify(result.body)}`)
      if (result.status >= 500) throw new Error(`epoch-close failed: ${JSON.stringify(result.body)}`)
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
