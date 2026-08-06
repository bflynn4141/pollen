#!/usr/bin/env node
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
import { maybeSignWalletBinding } from './register-sign.js'

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
      console.log(`Synced: ${result.contributions} contributions, ${result.tool_events} tool_events, ${result.sessions} sessions, ${result.lifecycle_events} lifecycle, ${result.x402_events} x402`)
      break
    }
    case 'backfill-subjects': {
      console.log('Backfilling session subjects via Haiku...')
      const result = await backfillSubjects(db)
      console.log(`Done: ${result.filled} filled, ${result.skipped} skipped (${result.total} total)`)
      break
    }
    case 'backfill': {
      if (!process.argv.includes('--codex')) {
        console.error('Usage: pollen backfill --codex [--days N]')
        process.exit(1)
      }
      const daysIdx = process.argv.indexOf('--days')
      const days = daysIdx !== -1 ? parseInt(process.argv[daysIdx + 1] ?? '30', 10) : 30
      if (!Number.isFinite(days) || days <= 0) {
        console.error('--days must be a positive number')
        process.exit(1)
      }
      const { backfillCodex } = await import('./codex-backfill.js')
      console.log(`Backfilling Codex sessions (last ${days} days)...`)
      const result = await backfillCodex(db, { days })
      for (const warning of result.warnings) {
        console.warn(`  ⚠  ${warning}`)
      }
      console.log(`Done: ${result.sessions} sessions, ${result.toolEvents} tool events from ${result.files} files (${result.skippedFiles} skipped)`)
      break
    }
    case 'seed': {
      const { seedV4 } = await import('./seed-v4.js')
      console.log('Seeding v4 demo data...')
      const result = seedV4(db)
      console.log(`Seeded: ${result.sessions} sessions, ${result.contributions} contributions, ${result.toolEvents} tool events, ${result.lifecycleEvents} lifecycle events`)
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
    case 'brief': {
      const args = process.argv.slice(3)
      const flagValue = (name: string): string | undefined => {
        const idx = args.indexOf(name)
        const val = idx !== -1 ? args[idx + 1] : undefined
        return val && !val.startsWith('--') ? val : undefined
      }
      const daysRaw = flagValue('--days')
      const days = daysRaw != null ? parseInt(daysRaw, 10) : 7
      if (!Number.isFinite(days) || days <= 0) {
        console.error('--days must be a positive number')
        process.exit(1)
      }
      const outFlag = flagValue('--out')
      const toFlag = flagValue('--to')
      const doSend = args.includes('--send')
      const doOpen = args.includes('--open')
      const quiet = args.includes('--quiet')

      const { getBriefEmail, setBriefEmail } = await import('./config.js')
      if (toFlag) {
        if (!toFlag.includes('@')) {
          console.error(`Invalid email address: ${toFlag}`)
          process.exit(1)
        }
        setBriefEmail(toFlag)
        if (!quiet) console.log(`✓ Brief recipient saved: ${toFlag}`)
      }

      const { generateBrief, isoWeekOf } = await import('./brief.js')
      const { recordBrief } = await import('./store.js')
      const result = await generateBrief(db, { days })

      const { writeFileSync, mkdirSync } = await import('node:fs')
      const { join, dirname } = await import('node:path')
      const { homedir } = await import('node:os')
      const week = isoWeekOf()
      const outPath = outFlag ?? join(homedir(), '.pollen', `brief-${week}.html`)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, result.html)

      if (!quiet) {
        console.log(result.text)
        console.log('')
        console.log(`Saved: ${outPath}  (polish: ${result.polish})`)
      }

      recordBrief(db, {
        isoWeek: week,
        findingsJson: JSON.stringify(result.findings),
        htmlPath: outPath,
      })

      if (doOpen) {
        const { spawn } = await import('node:child_process')
        spawn('open', [outPath], { stdio: 'ignore', detached: true }).unref()
      }

      if (doSend) {
        let recipient = toFlag ?? getBriefEmail()
        if (!recipient) {
          // First --send with no recipient configured anywhere: set the default once.
          recipient = 'bflynn.me@gmail.com'
          setBriefEmail(recipient)
          if (!quiet) console.log(`No recipient configured — defaulting to ${recipient} (change with: pollen brief --to <email>)`)
        }
        const { sendEmail, StableEmailError } = await import('./stableemail.js')
        try {
          const receipt = await sendEmail({
            to: [recipient],
            subject: result.subject,
            html: result.html,
            text: result.text,
          })
          recordBrief(db, { isoWeek: week, sentTo: recipient })
          if (!quiet) {
            const paid = receipt.paidUsd && receipt.paidUsd !== '0' ? ` ($${receipt.paidUsd} USDC via x402)` : ''
            console.log(`✓ Brief emailed to ${recipient}${paid}${receipt.id ? `  id: ${receipt.id}` : ''}`)
          }
        } catch (err) {
          if (err instanceof StableEmailError) {
            console.error(`Email not sent [${err.code}]: ${err.message}`)
          } else {
            console.error(`Email not sent: ${(err as Error).message}`)
          }
          process.exitCode = 1
        }
      }
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
      if (process.argv.includes('--codex')) {
        const { runCodexSetup } = await import('./codex-setup.js')
        await runCodexSetup()
        break
      }
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
      const { fetchEarnings, renderEarnings } = await import('./earnings.js')
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
      const { fetchPoints, renderPoints } = await import('./points.js')
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
      const bindingSig = await maybeSignWalletBinding(addr)
      if (bindingSig) {
        console.log('  \u2713 Wallet binding signed with POLLEN_PRIVATE_KEY (uploads on next sync).')
      }
      console.log('  This address will be used for claiming POLLEN tokens.')
      console.log('  Run `pollen sync` to update the Neon database.')
      break
    }
    case 'wallet': {
      if (process.argv[3] === 'bind') {
        const { runWalletBind } = await import('./wallet-bind.js')
        await runWalletBind()
      } else {
        await runInteractiveWallet()
      }
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

      // Default path: POLLEN payouts are automatic — nothing to claim.
      if (!isRevenue) {
        const { nextEpochClose } = await import('./credits.js')
        const next = nextEpochClose()
        console.log('POLLEN payouts are automatic — there is nothing to claim.')
        console.log('')
        console.log('  Verified contributors receive POLLEN weekly, pushed directly to their')
        console.log('  registered wallet after each epoch closes (Tuesdays 00:00 UTC).')
        console.log(`  Next payout: shortly after ${next.toUTCString()}`)
        console.log('')
        console.log('  Eligibility: `pollen verify` (World ID) + `pollen wallet` + `pollen sync`.')
        console.log('')

        const connStr = process.env.NEON_DATABASE_URL
        if (!connStr) {
          console.log('  Set NEON_DATABASE_URL to see your payout history here.')
          break
        }
        const { fetchWalletPayouts } = await import('./claim.js')
        const payouts = await fetchWalletPayouts(connStr, walletAddr)
        if (payouts === null) {
          console.log('  (payouts table not available yet — run migration 003_contributors.sql)')
        } else if (payouts.length === 0) {
          console.log('  No payouts recorded for your wallet yet.')
        } else {
          console.log('  Your payouts:')
          for (const p of payouts) {
            const tx = p.tx_hash ? `  tx: ${p.tx_hash}` : ''
            console.log(`    Epoch ${String(p.epoch).padEnd(4)} ${Number(p.amount).toLocaleString().padStart(12)} POLLEN  [${p.status}]${tx}`)
          }
        }
        break
      }

      // --revenue: USDC revenue is still pull-based (PollenTokenV2.claimRevenue)

      // Para wallet path — claim via proxy (no private key needed)
      if (config?.para_wallet) {
        const apiKey = process.env.POLLEN_API_KEY
        if (!apiKey) {
          console.error('Set POLLEN_API_KEY to claim via managed wallet.')
          process.exit(1)
        }

        const { claimRevenueViaProxy } = await import('./claim.js')
        console.log('Claiming USDC revenue from POLLEN holdings...')
        const result = await claimRevenueViaProxy(config.para_wallet, apiKey)
        if ('error' in result) {
          console.error(`  ${result.error}`)
          process.exit(1)
        }
        console.log(`\u2713 Revenue claimed! tx: ${result.txHash}`)
        break
      }

      // BYO wallet path — claims directly with POLLEN_PRIVATE_KEY
      const privateKey = process.env.POLLEN_PRIVATE_KEY
      if (!privateKey) {
        console.error('Set POLLEN_PRIVATE_KEY to claim revenue with your own wallet.')
        console.error('  Or switch to a managed wallet: pollen wallet --email you@example.com')
        process.exit(1)
      }
      const tokenAddress = process.env.POLLEN_TOKEN_ADDRESS
      if (!tokenAddress) {
        console.error('Set POLLEN_TOKEN_ADDRESS (PollenTokenV2 on Base) to claim revenue.')
        process.exit(1)
      }
      const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org'

      const { claimRevenue } = await import('./claim.js')
      console.log('Claiming USDC revenue from POLLEN holdings...')
      const result = await claimRevenue(tokenAddress as `0x${string}`, rpcUrl, privateKey as `0x${string}`)
      if ('error' in result) {
        console.error(`  ${result.error}`)
        process.exit(1)
      }
      console.log(`\u2713 Revenue claimed! tx: ${result.txHash}`)
      break
    }
    default:
      console.log([
        'Usage: pollen <command>',
        '',
        'Commands:',
        '  setup           Guided onboarding — hooks, wallet, everything',
        '  setup --demo    Same flow, nothing written to disk (for demos)',
        '  setup --codex   Install pollen hooks into ~/.codex/hooks.json',
        '  backfill --codex [--days N]  Ingest historical Codex sessions (default 30 days)',
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
        '  seed        Generate 20 realistic v4 demo sessions',
        '  my          Interactive dashboard — see exactly what you\'ve contributed',
        '  brief       Weekly top-3 coaching digest: pollen brief [--days 7] [--out <path>] [--open] [--send] [--to <email>]',
        '  sync        Push local data to Neon (needs NEON_DATABASE_URL)',
        '  verify      Prove you are a unique human via World ID',
        '  status      Show contributor identity + verification status',
        '  earnings    Show epoch scores, score breakdowns, and weekly payouts',
        '  points      Simulated POLLEN balance (same math as real distribution)',
        '  wallet      Set up a wallet (managed or bring-your-own)',
        '  register    Link an Ethereum wallet: pollen register <address>',
        '  claim       Payout status (POLLEN payouts are pushed automatically each week)',
        '  claim --revenue  Claim accumulated USDC revenue',
        '  backfill-subjects  Extract subjects for existing sessions (needs ANTHROPIC_API_KEY)',
      ].join('\n'))
  }
} finally {
  db.close()
}
})()
