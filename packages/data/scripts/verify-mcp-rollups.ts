import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'
import { computeRollups } from '../src/rollups'
import { readReceiptNetwork } from '../src/rollup-queries'
import { configureDb } from '../src/neon'

const databaseUrl = process.env.NEON_DATABASE_URL
if (!databaseUrl || process.env.POLLEN_ALLOW_TEST_FIXTURES !== '1') {
  throw new Error('Set NEON_DATABASE_URL and POLLEN_ALLOW_TEST_FIXTURES=1 on an isolated database branch')
}

const sql = neon(databaseUrl)
configureDb(databaseUrl)

async function executeStatements(source: string) {
  const withoutComments = source.replace(/--.*$/gm, '')
  for (const statement of withoutComments.split(';').map(part => part.trim()).filter(Boolean)) {
    await sql.query(statement)
  }
}

await executeStatements(`
  CREATE TABLE IF NOT EXISTS tool_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    tool_name TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    mcp_server TEXT,
    contributor_id TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    started_at BIGINT NOT NULL,
    mcp_servers_used TEXT,
    contributor_id TEXT
  );
`)

for (const name of [
  '001_rollups.sql',
  '003_contributors.sql',
  '006_network_receipts.sql',
  '009_network_receipt_mcp_calls.sql',
]) {
  const migration = await readFile(new URL(`../../site/migrations/${name}`, import.meta.url), 'utf8')
  await executeStatements(migration)
}

const now = new Date()
const marker = `mcp-rollup-test-${now.getTime()}`
const contributorIds = Array.from({ length: 5 }, (_, index) => `${marker}-${index}`)

try {
  for (const [index, contributorId] of contributorIds.entries()) {
    await sql`INSERT INTO contributors (contributor_id) VALUES (${contributorId})`
    const mcpCalls = JSON.stringify([
      {
        server: 'github',
        tool: 'create_issue',
        success: index !== 4,
        latency_bucket: index < 3 ? 'fast' : 'moderate',
      },
    ])
    await sql`
      INSERT INTO network_receipts (
        receipt_id, contributor_id, observed_at, intent, agent, model,
        tool_category_sequence, duration_bucket, terminal_state, check_result,
        mcp_calls
      ) VALUES (
        ${randomUUID()}, ${contributorId}, ${now.getTime() - (index + 1) * 1_000},
        'feature_build', 'codex', 'gpt-5.6-sol', ${['interact']},
        'quick', 'completed', 'passed', ${mcpCalls}::jsonb
      )`
  }

  await computeRollups(now)
  const snapshot = await readReceiptNetwork('rolling:24h:current')
  const server = snapshot?.mcpServers.find(item => item.server === 'github')
  const tool = snapshot?.mcpTools.find(item => item.server === 'github' && item.tool === 'create_issue')

  if (!server || server.calls < 5 || server.successRate !== 0.8 || server.latencyBucket !== 'fast') {
    throw new Error(`unexpected MCP server rollup: ${JSON.stringify(server)}`)
  }
  if (!tool || tool.calls < 5 || tool.successRate !== 0.8 || tool.latencyBucket !== 'fast') {
    throw new Error(`unexpected MCP tool rollup: ${JSON.stringify(tool)}`)
  }
  console.log('MCP rollup integration passed: server + tool cells cleared k=5')
} finally {
  if (process.env.POLLEN_KEEP_TEST_FIXTURES !== '1') {
    await sql`DELETE FROM contributors WHERE contributor_id = ANY(${contributorIds})`
    await computeRollups(now)
  }
}
