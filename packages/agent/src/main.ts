#!/usr/bin/env node
/**
 * pollen-agent — weekly payout job, signed by a Splits subaccount.
 *
 * Usage:
 *   pollen-agent payout [--epoch N] [--resume] [--dry-run] [--preflight]
 *
 * Env: SPLITS_API_KEY, SPLITS_SUBACCOUNT (name or 0x address),
 *      SPLITS_SIGNER_KEY (optional; imported into the local keystore for
 *      headless signing on fresh runners), NEON_DATABASE_URL,
 *      POLLEN_TOKEN_ADDRESS, BASE_RPC_URL.
 *
 * x402 revenue does NOT flow through this agent: X402_PAY_TO points at the
 * existing Split contract, which distributes it directly.
 */
import type { Address } from 'viem'
import { createNeonStore } from './db.js'
import { createSplitsMintChain } from './mint.js'
import { PayoutAbort, runPayout } from './payout.js'
import { runPreflight } from './preflight.js'
import { SplitsMcpDriver, ensureLocalSignerKey, resolveSubaccount } from './splits.js'

function usage(): never {
  console.error([
    'Usage: pollen-agent <command>',
    '',
    'Commands:',
    '  payout [--epoch N] [--resume] [--dry-run]   Mint the weekly pro-rata payout for the just-closed epoch',
    '  payout --preflight                          Validate Splits auth, subaccount, and MINTER_ROLE without proposing',
  ].join('\n'))
  process.exit(1)
}

interface Flags {
  epoch?: number
  resume: boolean
  dryRun: boolean
  preflight: boolean
}

function parsePayoutFlags(argv: string[]): Flags {
  const flags: Flags = { resume: false, dryRun: false, preflight: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--epoch') {
      const value = argv[++i]
      flags.epoch = Number(value)
      if (value === undefined || !Number.isInteger(flags.epoch)) {
        console.error(`--epoch expects an integer, got: ${value}`)
        process.exit(1)
      }
    } else if (arg === '--resume') {
      flags.resume = true
    } else if (arg === '--dry-run') {
      flags.dryRun = true
    } else if (arg === '--preflight') {
      flags.preflight = true
    } else {
      console.error(`Unknown flag: ${arg}`)
      process.exit(1)
    }
  }
  return flags
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} is not set.`)
    process.exit(1)
  }
  return value
}

const [, , command, ...rest] = process.argv

;(async () => {
  switch (command) {
    case 'payout': {
      const flags = parsePayoutFlags(rest)

      if (flags.preflight) {
        const tokenAddress = requireEnv('POLLEN_TOKEN_ADDRESS') as Address
        const subaccount = process.env.SPLITS_SUBACCOUNT ?? 'pollen-payout'
        const driver = new SplitsMcpDriver()
        try {
          await ensureLocalSignerKey()
          const ok = await runPreflight(driver, {
            subaccount,
            tokenAddress,
            rpcUrl: process.env.BASE_RPC_URL,
          })
          process.exit(ok ? 0 : 1)
        } finally {
          driver.close()
        }
      }

      const store = createNeonStore(requireEnv('NEON_DATABASE_URL'))

      if (flags.dryRun) {
        // Dry runs never touch Splits or the chain: stub the mint layer.
        await runPayout({
          store,
          chain: { mintBatch: async () => { throw new Error('unreachable in --dry-run') } },
        }, flags)
        break
      }

      const tokenAddress = requireEnv('POLLEN_TOKEN_ADDRESS') as Address
      const subaccountEnv = process.env.SPLITS_SUBACCOUNT ?? 'pollen-payout'
      const driver = new SplitsMcpDriver()
      try {
        await ensureLocalSignerKey()
        const subaccount = await resolveSubaccount(driver, subaccountEnv)
        console.log(`Payout signer: Splits subaccount '${subaccountEnv}' (${subaccount})`)
        const chain = createSplitsMintChain(driver, {
          subaccount,
          tokenAddress,
          log: console.log,
        })
        await runPayout({ store, chain }, flags)
      } finally {
        driver.close()
      }
      break
    }
    default:
      usage()
  }
})().catch((err: unknown) => {
  if (err instanceof PayoutAbort) {
    console.error(err.message)
    process.exit(err.exitCode)
  }
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
