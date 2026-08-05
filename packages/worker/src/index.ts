import { Hono } from 'hono'
import type { Context } from 'hono'
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
import { createPollenPaymentMiddleware, type X402RelayEnv } from './x402-relay'
export { X402SettlementRelayer } from './x402-relay'

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
 * Paid endpoints are gated by x402 (USDC on Base) and relayed through
 * PollenSettlementV2. Free endpoints send `public, max-age=300`; paid
 * endpoints send `no-store`.
 */

export interface Env extends X402RelayEnv {
  // Secrets (wrangler secret put):
  NEON_DATABASE_URL: string
  ADMIN_SECRET: string
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
