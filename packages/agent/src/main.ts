#!/usr/bin/env node
/**
 * pollen-agent — weekly payout job, signed by a Splits subaccount.
 *
 * Usage:
 *   pollen-agent payout [--epoch N] [--resume] [--dry-run] [--preflight]
 *   pollen-agent active-revenue-plan --epoch N --pool-atomic N --snapshot-block N
 *
 * Env: SPLITS_API_KEY, SPLITS_SUBACCOUNT (name or 0x address),
 *      SPLITS_SIGNER_KEY (optional; imported into the local keystore for
 *      headless signing on fresh runners), NEON_DATABASE_URL,
 *      POLLEN_TOKEN_ADDRESS, BASE_RPC_URL.
 *
 * This agent does not settle x402 payments. V2 payments go through the deployed
 * settlement contract. The V3 planning command is read-only and cannot publish
 * a root or move revenue.
 */
import { createPublicClient, http, type Address } from 'viem'
import { base } from 'viem/chains'
import {
  createActiveRevenueSourceStore,
  prepareActiveRevenuePlan,
} from './active-revenue-plan.js'
import { stringifyActiveRevenueArtifact } from './active-revenue-artifact.js'
import { createNeonStore } from './db.js'
import { createSplitsMintChain } from './mint.js'
import { PayoutAbort, runPayout } from './payout.js'
import { runPreflight } from './preflight.js'
import { SplitsMcpDriver, ensureLocalSignerKey, resolveSubaccount } from './splits.js'
import type { PollenSnapshotClient } from './pollen-snapshot.js'

function usage(): never {
  console.error([
    'Usage: pollen-agent <command>',
    '',
    'Commands:',
    '  payout [--epoch N] [--resume] [--dry-run]   Mint the weekly pro-rata payout for the just-closed epoch',
    '  payout --preflight                          Validate Splits auth, subaccount, and MINTER_ROLE without proposing',
    '  active-revenue-plan --epoch N --pool-atomic N --snapshot-block N',
    '                                               Print a read-only V3 Merkle draft; never writes or publishes',
  ].join('\n'))
  process.exit(1)
}

interface ActiveRevenuePlanFlags {
  epoch: number
  poolAtomicUsdc: bigint
  snapshotBlock: bigint
}

function parseRequiredInteger(value: string | undefined, name: string): bigint {
  try {
    const parsed = BigInt(value ?? '')
    if (parsed <= BigInt(0)) throw new Error('not positive')
    return parsed
  } catch {
    console.error(`${name} expects a positive integer, got: ${value}`)
    process.exit(1)
  }
}

function parseActiveRevenuePlanFlags(argv: string[]): ActiveRevenuePlanFlags {
  let epoch: number | undefined
  let poolAtomicUsdc: bigint | undefined
  let snapshotBlock: bigint | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[++i]
    if (arg === '--epoch') epoch = Number(value)
    else if (arg === '--pool-atomic') poolAtomicUsdc = parseRequiredInteger(value, arg)
    else if (arg === '--snapshot-block') snapshotBlock = parseRequiredInteger(value, arg)
    else {
      console.error(`Unknown active-revenue-plan flag: ${arg}`)
      process.exit(1)
    }
  }
  if (!Number.isInteger(epoch) || (epoch ?? 0) < 1) {
    console.error(`--epoch expects a 1-based integer, got: ${epoch}`)
    process.exit(1)
  }
  if (poolAtomicUsdc === undefined || snapshotBlock === undefined) usage()
  return { epoch: epoch!, poolAtomicUsdc, snapshotBlock }
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
    case 'active-revenue-plan': {
      const flags = parseActiveRevenuePlanFlags(rest)
      const rpcUrl = process.env.BASE_ARCHIVE_RPC_URL ?? requireEnv('BASE_RPC_URL')
      const client = createPublicClient({ chain: base, transport: http(rpcUrl) })
      const artifact = await prepareActiveRevenuePlan({
        sourceStore: createActiveRevenueSourceStore(requireEnv('NEON_DATABASE_URL')),
        snapshotClient: client as unknown as PollenSnapshotClient,
      }, {
        distributionEpoch: flags.epoch,
        poolAtomicUsdc: flags.poolAtomicUsdc,
        tokenAddress: requireEnv('POLLEN_TOKEN_ADDRESS'),
        snapshotBlock: flags.snapshotBlock,
      })
      process.stdout.write(stringifyActiveRevenueArtifact(artifact))
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
