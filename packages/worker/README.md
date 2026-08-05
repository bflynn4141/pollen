# pollen-api (Cloudflare Worker)

Public trending API served at **api.pollen.id**, plus the two cron jobs
(rollup recompute every 6h; epoch-close scoring Tuesdays 00:10 UTC). Moved off
Vercel so the site stays Hobby-plan-safe; same architecture as
prompt-trends' backend (Hono + @neondatabase/serverless + cron triggers).

- **Free** (`Cache-Control: public, max-age=300`): `GET /trending/tools`,
  `GET /trending/mcp`, `GET /overview`
- **Paid via x402, USDC on Base** (`Cache-Control: no-store`):
  `GET /tools/history?tool=` ($0.01), `GET /mcp/history?server=` ($0.01),
  `GET /grid` ($0.05), `GET /export` ($0.25)
- All endpoints also answer under an `/api/v1` prefix.
- **Admin** (Bearer `ADMIN_SECRET`): `POST /admin/run/rollups`,
  `POST /admin/run/epoch-close[?epoch=N][&force=1]`

k-anonymity boundary: handlers import only the `@pollen/data` rollup readers
(`rollup_cells`, every cell ≥ 5 contributors). `computeRollups()` is the sole
raw-table path and runs only from cron/admin.

## Deploy runbook

```bash
# 0. one-time: authenticate wrangler with the Cloudflare account that owns
#    the pollen.id zone
npx wrangler login

cd packages/worker

# 1. secrets (prompted for each value)
npx wrangler secret put NEON_DATABASE_URL
npx wrangler secret put ADMIN_SECRET
# mainnet x402 settlement only (skip while X402_NETWORK=base-sepolia):
npx wrangler secret put CDP_API_KEY_ID
npx wrangler secret put CDP_API_KEY_SECRET

# 2. vars: edit wrangler.toml
#    - X402_PAY_TO   = AgentKit wallet address (REQUIRED in prod; empty
#                      string serves paid endpoints unpaid)
#    - X402_NETWORK  = "base-sepolia" first, flip to "base" for mainnet

# 3. deploy (also provisions the api.pollen.id custom domain + crons)
npx wrangler deploy

# 4. DNS: pollen.id must be a zone on this Cloudflare account. The
#    `custom_domain = true` route creates the proxied api.pollen.id record
#    automatically; verify under Workers & Pages → pollen-api → Settings →
#    Domains & Routes (and remove any old api.pollen.id record pointing at
#    Vercel).

# 5. smoke test
curl -i https://api.pollen.id/trending/tools            # 200, max-age=300
curl -i https://api.pollen.id/grid                      # 402 x402 challenge
curl -X POST https://api.pollen.id/admin/run/rollups \
  -H "Authorization: Bearer $ADMIN_SECRET"              # first backfill

# local dev
npx wrangler dev
# manual cron test against wrangler dev:
curl "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*"
```

## Verification without deploying

```bash
pnpm --filter @pollen/worker typecheck
pnpm --filter @pollen/worker check   # wrangler deploy --dry-run
```
