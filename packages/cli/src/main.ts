import {
  initDb, getStats,
  queryIntentDistribution, queryLanguageDistribution,
  queryTimePatterns, queryTrends,
  queryToolFrequency, queryToolPairs, queryToolFailures, queryToolTriples,
  querySessionSummaries, querySessionArcs,
  queryMcpServerUsage, queryProjectDistribution,
  queryTopicDistribution, queryActionDistribution, queryActionTopicCombinations, queryTopicSatisfaction,
  querySatisfactionByIntent, querySatisfactionOverview,
} from './store.js'
import {
  renderStats, renderIntents, renderLanguages, renderWhen, renderTrends,
  renderToolFrequency, renderToolPairs, renderToolFailures, renderToolTriples,
  renderSessionSummaries, renderSessionArcs,
  renderMcpServers, renderProjects,
  renderTopics, renderSatisfaction,
} from './query.js'
import { syncToNeon } from './sync.js'
import { backfillSubjects } from './backfill-subjects.js'
import { runVerify, runStatus } from './verify.js'
import { DB_PATH, registerWallet, isValidAddress, loadConfig, setupWallet, getWalletAddress, runInteractiveWallet } from './config.js'
import { formatUnits } from 'viem'
import { fetchEarnings, renderEarnings } from './earnings.js'
import { fetchPoints, renderPoints } from './points.js'

function openDb() {
  try {
    return initDb(DB_PATH)
  } catch {
    console.error('No pollen data found. Use Claude Code with the hook active to start collecting.')
    process.exit(1)
  }
}

const command = process.argv[2]

const db = openDb()

;(async () => {
try {
  switch (command) {
    case 'stats':
      console.log(renderStats(getStats(db)))
      break
    case 'intents':
      console.log(renderIntents(queryIntentDistribution(db)))
      break
    case 'languages':
      console.log(renderLanguages(queryLanguageDistribution(db)))
      break
    case 'tools':
      console.log(renderToolFrequency(queryToolFrequency(db)))
      break
    case 'flows':
      console.log(renderToolPairs(queryToolPairs(db)))
      console.log(renderToolTriples(queryToolTriples(db)))
      console.log(renderToolFailures(queryToolFailures(db)))
      break
    case 'mcp':
      console.log(renderMcpServers(queryMcpServerUsage(db)))
      break
    case 'projects':
      console.log(renderProjects(queryProjectDistribution(db)))
      break
    case 'topics':
      console.log(renderTopics(
        queryTopicDistribution(db),
        queryActionDistribution(db),
        queryActionTopicCombinations(db),
        queryTopicSatisfaction(db),
      ))
      break
    case 'satisfaction':
    case 'value':
      console.log(renderSatisfaction(
        querySatisfactionOverview(db),
        querySatisfactionByIntent(db),
      ))
      break
    case 'sessions':
      console.log(renderSessionSummaries(querySessionSummaries(db)))
      console.log(renderSessionArcs(querySessionArcs(db)))
      break
    case 'when':
      console.log(renderWhen(queryTimePatterns(db)))
      break
    case 'trends': {
      const days = parseInt(process.argv[3] ?? '7', 10)
      console.log(renderTrends(queryTrends(db, days)))
      break
    }
    case 'sync': {
      const connStr = process.env.NEON_DATABASE_URL
      if (!connStr) {
        console.error('Set NEON_DATABASE_URL to sync. Example:')
        console.error('  export NEON_DATABASE_URL="postgresql://..."')
        process.exit(1)
      }
      console.log('Syncing to Neon...')
      const result = await syncToNeon(db, connStr)
      console.log(`Synced: ${result.contributions} contributions, ${result.tool_events} tool_events, ${result.sessions} sessions, ${result.scored} scored`)
      break
    }
    case 'backfill-subjects': {
      console.log('Backfilling session subjects via Haiku...')
      const result = await backfillSubjects(db)
      console.log(`Done: ${result.filled} filled, ${result.skipped} skipped (${result.total} total)`)
      break
    }
    case 'my': {
      const { render } = await import('ink')
      const { MyApp } = await import('./ui/MyApp.js')
      const { createElement } = await import('react')
      const app = render(createElement(MyApp, { db }))
      await app.waitUntilExit()
      break
    }
    case 'verify': {
      await runVerify()
      break
    }
    case 'status': {
      runStatus()
      break
    }
    case 'setup': {
      const { runSetup } = await import('./setup.js')
      const demo = process.argv.includes('--demo')
      await runSetup(demo)
      break
    }
    case 'earnings': {
      const connStr = process.env.NEON_DATABASE_URL
      if (!connStr) {
        console.error('Set NEON_DATABASE_URL to view earnings. Example:')
        console.error('  export NEON_DATABASE_URL="postgresql://..."')
        process.exit(1)
      }
      const data = await fetchEarnings(connStr)
      if (!data) {
        console.log('No pollen config found. Run `pollen verify` to set up identity.')
      } else {
        console.log(renderEarnings(data))
      }
      break
    }
    case 'points': {
      const connStr = process.env.NEON_DATABASE_URL
      if (!connStr) {
        console.error('Set NEON_DATABASE_URL to view points. Example:')
        console.error('  export NEON_DATABASE_URL="postgresql://..."')
        process.exit(1)
      }
      const data = await fetchPoints(connStr)
      if (!data) {
        console.log('No pollen config found. Run `pollen verify` to set up identity.')
      } else {
        console.log(renderPoints(data))
      }
      break
    }
    case 'register': {
      const addr = process.argv[3]
      if (!addr) {
        console.error('Usage: pollen register <ethereum-address>')
        console.error('  Example: pollen register 0x1234...abcd')
        process.exit(1)
      }
      if (!isValidAddress(addr)) {
        console.error(`Invalid Ethereum address: ${addr}`)
        console.error('Address must be 0x followed by 40 hex characters.')
        process.exit(1)
      }
      registerWallet(addr)
      console.log(`\u2713 Wallet registered: ${addr}`)
      console.log('  This address will be used for claiming POLLEN tokens.')
      console.log('  Run `pollen sync` to update the Neon database.')
      break
    }
    case 'wallet': {
      await runInteractiveWallet()
      break
    }
    case 'claim': {
      const config = loadConfig()
      const walletAddr = getWalletAddress()
      if (!walletAddr) {
        console.error('No wallet configured. Run: pollen wallet')
        process.exit(1)
      }

      const isRevenue = process.argv[3] === '--revenue'

      // Para wallet path — claim via proxy (no private key needed)
      if (config?.para_wallet) {
        const connStr = process.env.NEON_DATABASE_URL
        if (!connStr && !isRevenue) {
          console.error('Set NEON_DATABASE_URL to claim. Example:')
          console.error('  export NEON_DATABASE_URL="postgresql://..."')
          process.exit(1)
        }
        const apiKey = process.env.POLLEN_API_KEY
        if (!apiKey) {
          console.error('Set POLLEN_API_KEY to claim via managed wallet.')
          process.exit(1)
        }

        const { claimViaProxy, claimRevenueViaProxy } = await import('./claim.js')
        if (isRevenue) {
          console.log('Claiming USDC revenue from POLLEN holdings...')
          const result = await claimRevenueViaProxy(config.para_wallet, apiKey)
          if ('error' in result) {
            console.error(`  ${result.error}`)
            process.exit(1)
          }
          console.log(`\u2713 Revenue claimed! tx: ${result.txHash}`)
        } else {
          console.log('Claiming POLLEN tokens...')
          const result = await claimViaProxy(connStr!, config.para_wallet, apiKey)
          if ('error' in result) {
            console.error(`  ${result.error}`)
            process.exit(1)
          }
          console.log(`\u2713 Claimed ${formatUnits(result.amount, 18)} POLLEN! tx: ${result.txHash}`)
        }
        break
      }

      // EOA path — needs private key
      const privateKey = process.env.POLLEN_PRIVATE_KEY
      if (!privateKey) {
        console.error('Set POLLEN_PRIVATE_KEY to claim with your own wallet.')
        console.error('  Or switch to a managed wallet: pollen wallet --email you@example.com')
        process.exit(1)
      }

      console.log(isRevenue
        ? 'Claiming USDC revenue from POLLEN holdings...'
        : 'Claiming POLLEN tokens...')
      console.log('')
      console.log('  Claim requires on-chain contract deployment.')
      console.log('  Contracts: contracts/src/PollenToken.sol + PollenDistributor.sol')
      console.log('  Deploy with: cd contracts && forge script script/Deploy.s.sol --broadcast')
      console.log('')
      console.log('  After deployment, set these environment variables:')
      console.log('    POLLEN_TOKEN_ADDRESS=0x...')
      console.log('    POLLEN_DISTRIBUTOR_ADDRESS=0x...')
      console.log('    BASE_RPC_URL=https://...')
      break
    }
    default:
      console.log([
        'Usage: pollen <command>',
        '',
        'Commands:',
        '  setup           Guided onboarding — hooks, wallet, everything',
        '  setup --demo    Same flow, nothing written to disk (for demos)',
        '  stats       Summary dashboard',
        '  intents     Intent distribution',
        '  languages   Language breakdown',
        '  tools       Tool frequency + success rates (from actual usage)',
        '  flows       Tool sequences + failure patterns',
        '  mcp         MCP server usage ranking',
        '  projects    Project type distribution',
        '  topics      What people work on + try to do',
        '  value         Information Value Scores + session signals',
        '  sessions    Session summaries + workflow arcs',
        '  when        Time patterns',
        '  trends [n]  Daily trends (last n days, default 7)',
        '  my          Interactive dashboard — see exactly what you\'ve contributed',
        '  sync        Push local data to Neon (needs NEON_DATABASE_URL)',
        '  verify      Prove you are a unique human via World ID',
        '  status      Show contributor identity + verification status',
        '  earnings    Show credits, token balance, and claimable revenue',
        '  points      Simulated POLLEN balance (same math as real distribution)',
        '  wallet      Set up a wallet (managed or bring-your-own)',
        '  register    Link an Ethereum wallet: pollen register <address>',
        '  claim       Claim POLLEN tokens for completed epochs',
        '  claim --revenue  Claim accumulated USDC revenue',
        '  backfill-subjects  Extract subjects for existing sessions (needs ANTHROPIC_API_KEY)',
      ].join('\n'))
  }
} finally {
  db.close()
}
})()
