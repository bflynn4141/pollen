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
