import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readRepoFile = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('Cloudflare closes epochs on Tuesday using an unambiguous weekday', async () => {
  const [config, worker] = await Promise.all([
    readRepoFile('packages/worker/wrangler.toml'),
    readRepoFile('packages/worker/src/index.ts'),
  ])

  // Cloudflare uses 1=Sunday, unlike GitHub/POSIX cron where 0=Sunday.
  // A named weekday prevents the two schedulers from silently diverging.
  assert.match(config, /"10 0 \* \* TUE"/)
  assert.match(worker, /case '10 0 \* \* TUE'/)
  assert.doesNotMatch(config, /"10 0 \* \* 2"/)
})

test('production health reports an actionable admin-secret mismatch', async () => {
  const workflow = await readRepoFile('.github/workflows/production-health.yml')

  assert.match(workflow, /ADMIN_SECRET: \$\{\{ secrets\.WORKER_ADMIN_SECRET \}\}/)
  assert.match(workflow, /Admin health authentication failed/)
  assert.match(workflow, /GitHub Actions secret WORKER_ADMIN_SECRET/)
  assert.match(workflow, /Worker secret ADMIN_SECRET/)
})

test('payout recovery guidance names the live protected epoch-close endpoint', async () => {
  const payout = await readRepoFile('packages/agent/src/payout.ts')

  assert.match(payout, /POST \/admin\/run\/epoch-close\?epoch=/)
  assert.doesNotMatch(payout, /\/api\/cron\/epoch-close/)
})

test('V3 deployment uses the encrypted Foundry account instead of a raw private key', async () => {
  const deployment = await readRepoFile('contracts/script/DeployV3.s.sol')

  assert.match(deployment, /vm\.envAddress\("DEPLOYER_ADDRESS"\)/)
  assert.match(deployment, /vm\.startBroadcast\(\)/)
  assert.doesNotMatch(deployment, /DEPLOYER_PRIVATE_KEY/)
  assert.doesNotMatch(deployment, /vm\.envUint/)
})

test('production recovery is manual, serialized, and keeps credentials in GitHub', async () => {
  const recovery = await readRepoFile('.github/workflows/production-recovery.yml')

  assert.match(recovery, /workflow_dispatch:/)
  assert.doesNotMatch(recovery, /schedule:/)
  assert.match(recovery, /group: pollen-production-recovery/)
  assert.match(recovery, /secrets\.WORKER_ADMIN_SECRET/)
  assert.match(recovery, /secrets\.NEON_DATABASE_URL/)
  assert.match(recovery, /--single-transaction/)
  assert.match(recovery, /013_active_revenue\.sql/)
})

test('production clients use the verified Worker origin, not the unrelated pollen.id zone', async () => {
  const [config, earnings, docs] = await Promise.all([
    readRepoFile('packages/worker/wrangler.toml'),
    readRepoFile('packages/site/src/lib/contributor-earnings.ts'),
    readRepoFile('packages/site/content/docs/api.mdx'),
  ])

  assert.doesNotMatch(config, /pattern\s*=\s*"api\.pollen\.id"/)
  assert.match(earnings, /https:\/\/pollen-api\.bflynn4141\.workers\.dev/)
  assert.match(docs, /https:\/\/pollen-iota\.vercel\.app/)
})
