# pollen-api (Cloudflare Worker)

Public aggregate API targeted at **api.pollen.id**, plus the two cron jobs
(rollup recompute every 15m; epoch-close scoring Tuesdays 00:10 UTC). Moved off
Vercel so the site stays Hobby-plan-safe; same architecture as
prompt-trends' backend (Hono + @neondatabase/serverless + cron triggers).

The custom hostname currently requires the production repair documented in
`../../docs/PRODUCTION-DNS-RUNBOOK.md`. Until it is verified, the working
origin is `https://pollen-api.bflynn4141.workers.dev`.

- **Free** (`Cache-Control: public, max-age=300`): `GET /catalog`,
  `GET /network`, `GET /trending/tools`, `GET /trending/mcp`, `GET /overview`,
  and `GET /active-revenue/claims/:wallet`
- **Paid via x402 v2, USDC on Base** (`Cache-Control: no-store`):
  `GET /tools/history?tool=` ($0.01), `GET /mcp/history?server=` ($0.01),
  `GET /grid` ($0.05), `GET /export` ($0.25)
- Paid endpoints return HTTP 425 with `charged: false` and do not settle when
  no privacy-qualified rows are available.
- All endpoints also answer under an `/api/v1` prefix.
- **Admin** (Bearer `ADMIN_SECRET`): `POST /admin/run/rollups`,
  `POST /admin/run/epoch-close[?epoch=N][&force=1]`, and `GET /admin/health`

## Epoch scoring v2

Payout scores use authenticated `network_receipts` as the sole production
activity source. Legacy `sessions` and `tool_events` are local analysis tables
and never enter the payout calculation.

For each receipt, the scorer adds 1 base point, terminal-state points (0.5 for
completed; 0.25 for abandoned or error), 0.5 when a check ran (passed and
failed are valued equally), up to 0.25 for duration, and up to 0.5 for the
first 12 coarsened tool steps. A contributor receives 10 points per active UTC
day. Only the eight highest-value receipts per contributor per UTC day count,
so the seven-day maximum is 224 points. Intent, agent, and model diversity are
included in the transparent breakdown but are not score-weighted.

Epoch close is idempotent: an already-scored epoch is skipped. Use `force=1`
only for an intentional formula migration or historical recomputation; a forced
run also removes stale score rows that no longer have receipt-backed activity.

Payout execution has a hard quorum of five active, payout-eligible
contributors. A contributor counts only when the closed epoch has an
`epoch_scores` row, World ID verification is present, a wallet is registered,
and the wallet's EIP-191 binding signature verifies for that contributor. The
protected `GET /admin/health` response exposes the current count as
`payout_eligible_contributors`, the threshold as
`required_payout_eligible_contributors`, and sets `payout_ready` only when
scores exist and the current count is at least five.

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
# Set the GitHub Actions repository secret WORKER_ADMIN_SECRET to this same
# ADMIN_SECRET value. Production health intentionally fails with an actionable
# authentication error when the two stores drift.
# Gas-funded EOA used only to relay signed USDC authorizations through
# PollenSettlementV2. The buyer supplies the USDC; this key pays Base gas.
npx wrangler secret put X402_RELAYER_KEY

# 2. vars: edit wrangler.toml
#    - X402_PAY_TO   = PollenSettlementV2 on Base mainnet (required)
#    - BASE_RPC_URL  = Base mainnet RPC
#    - ACTIVE_REVENUE_CUTOVER_STATUS remains unset until a separately approved
#      V3 deployment and settlement cutover; only then set it to `live`

# 3. deploy (also provisions the api.pollen.id custom domain + crons)
npx wrangler deploy

# 4. DNS: pollen.id must be a zone on this Cloudflare account. The
#    `custom_domain = true` route creates the proxied api.pollen.id record
#    automatically; verify under Workers & Pages → pollen-api → Settings →
#    Domains & Routes (and remove any old api.pollen.id record pointing at
#    Vercel).

# 5. smoke test
curl -i https://api.pollen.id/catalog                   # 200, x402 v2 catalog
curl -i https://api.pollen.id/trending/tools            # 200, max-age=300
curl -i https://api.pollen.id/grid                      # 402, PAYMENT-REQUIRED
curl -X POST https://api.pollen.id/admin/run/rollups \
  -H "Authorization: Bearer $ADMIN_SECRET"              # first backfill

# local dev
npx wrangler dev
# manual cron tests against wrangler dev:
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*"
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=10+0+*+*+TUE"
```

## Verification without deploying

```bash
pnpm --filter @pollen/worker typecheck
pnpm --filter @pollen/worker test
pnpm --filter @pollen/worker check   # wrangler deploy --dry-run
```
