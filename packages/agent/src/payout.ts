/**
 * Weekly payout job: pro-rata POLLEN mint for the just-closed epoch.
 *
 * Flow:
 *   1. Target epoch = currentEpoch() - 1 (or --epoch N, which must be closed).
 *      PollenTokenV2.mintBatch only accepts the just-closed epoch, so any
 *      other closed epoch is dry-run-only.
 *   2. Assert epoch_scores rows exist (else: run the epoch-close cron first).
 *   3. Eligibility: World ID-verified contributors with a bound wallet
 *      (world_id_nullifier, verified_at, wallet_address all non-NULL).
 *   4. amount_i = floor(epochPool(epoch) * score_i / total_score); zeros dropped.
 *   5. Idempotency: existing payouts rows for the epoch abort the run unless
 *      --resume, which skips rows already status='confirmed'. Rows left
 *      'pending' by a crash are retried; the on-chain mintedInEpoch cap is the
 *      backstop against double-minting.
 *   6. --dry-run prints the payout table and exits before any DB write or tx.
 *   7. Write payouts rows status='pending', then chunked mintBatch (<=100
 *      recipients/tx). Each confirmed receipt marks its chunk 'confirmed'
 *      with the tx hash; a revert/send failure marks the chunk 'failed' and
 *      stops the run (rerun with --resume after diagnosing).
 */
import { formatUnits, type Address } from 'viem'
import { chunk, MAX_RECIPIENTS_PER_TX } from './chunk.js'
import type { PayoutStore } from './db.js'
import { currentEpoch, epochPool } from './epoch.js'
import type { MintChain } from './mint.js'
import { computePayouts, type PayoutAmount } from './prorata.js'

export class PayoutAbort extends Error {
  constructor(message: string, public readonly exitCode: number = 1) {
    super(message)
    this.name = 'PayoutAbort'
  }
}

export interface PayoutOptions {
  epoch?: number
  resume?: boolean
  dryRun?: boolean
  /** Injectable clock for tests. */
  nowMs?: number
}

export interface PayoutDeps {
  store: PayoutStore
  chain: MintChain
  log?: (line: string) => void
}

export interface PayoutRunResult {
  epoch: number
  dryRun: boolean
  planned: number
  minted: number
  skipped: number
  txHashes: string[]
}

export async function runPayout(deps: PayoutDeps, opts: PayoutOptions = {}): Promise<PayoutRunResult> {
  const log = deps.log ?? console.log
  const { store, chain } = deps
  const dryRun = opts.dryRun ?? false
  const resume = opts.resume ?? false

  // 1. Resolve target epoch
  const nowEpoch = currentEpoch(opts.nowMs)
  const justClosed = nowEpoch - 1
  if (justClosed < 1 && opts.epoch === undefined) {
    throw new PayoutAbort('No epoch has closed yet — first payout is possible after epoch 1 ends.')
  }
  const epoch = opts.epoch ?? justClosed
  if (!Number.isInteger(epoch) || epoch < 1) {
    throw new PayoutAbort(`Invalid epoch ${epoch}: epochs are 1-based integers.`)
  }
  if (epoch > justClosed) {
    throw new PayoutAbort(`Epoch ${epoch} is not closed yet (current epoch is ${nowEpoch}). Epochs close Tuesdays 00:00 UTC.`)
  }
  if (epoch !== justClosed && !dryRun) {
    throw new PayoutAbort(
      `Epoch ${epoch} is closed, but PollenTokenV2.mintBatch only accepts the just-closed epoch (${justClosed}). ` +
      'Use --dry-run to inspect this epoch.',
    )
  }

  // 2. Scores must exist for this epoch
  const scoreCount = await store.countEpochScores(epoch)
  if (scoreCount === 0) {
    throw new PayoutAbort(
      `No epoch_scores rows for epoch ${epoch} — run the epoch-close cron first ` +
      '(site: /api/cron/epoch-close), then re-run the payout.',
    )
  }

  // 3-4. Eligible contributors + pro-rata amounts
  const eligible = await store.fetchEligibleScores(epoch)
  log(`Epoch ${epoch}: ${scoreCount} scored contributors, ${eligible.length} eligible (World ID verified + wallet bound).`)
  const pool = epochPool(epoch)
  const payoutsAll = computePayouts(eligible, pool)

  // 5. Idempotency
  const existing = await store.fetchPayouts(epoch)
  const existingByContributor = new Map(existing.map(p => [p.contributor_id, p]))
  if (existing.length > 0 && !resume && !dryRun) {
    throw new PayoutAbort(
      `payouts rows already exist for epoch ${epoch} (${existing.length} rows). ` +
      'This epoch appears to be paid or in flight — pass --resume to retry unconfirmed rows.',
    )
  }
  const toMint = payoutsAll.filter(p => existingByContributor.get(p.contributor_id)?.status !== 'confirmed')
  const skipped = payoutsAll.length - toMint.length

  // 6. Dry run: print and exit before any write or tx
  printTable(log, epoch, pool, payoutsAll, existingByContributor)
  if (dryRun) {
    log('')
    log(`--dry-run: no payouts written, no transactions sent. Would mint to ${toMint.length} wallets` +
      ` in ${chunk(toMint).length} tx (${skipped} already confirmed).`)
    return { epoch, dryRun: true, planned: payoutsAll.length, minted: 0, skipped, txHashes: [] }
  }

  if (toMint.length === 0) {
    log('Nothing to mint — every eligible payout is already confirmed.')
    return { epoch, dryRun: false, planned: payoutsAll.length, minted: 0, skipped, txHashes: [] }
  }

  // 7. Write pending rows, then mint in chunks
  await store.insertPendingPayouts(epoch, toMint)

  const txHashes: string[] = []
  let minted = 0
  for (const [i, batch] of chunk(toMint, MAX_RECIPIENTS_PER_TX).entries()) {
    const recipients = batch.map(p => p.wallet_address as Address)
    const amounts = batch.map(p => p.amountWei)
    const ids = batch.map(p => p.contributor_id)
    log(`Minting chunk ${i + 1}: ${batch.length} recipients, ${formatUnits(sum(amounts), 18)} POLLEN...`)

    let result
    try {
      result = await chain.mintBatch(recipients, amounts, epoch)
    } catch (err) {
      await store.markPayouts(epoch, ids, 'failed', null)
      throw new PayoutAbort(
        `mintBatch send failed for chunk ${i + 1} (${ids.length} rows marked failed): ${(err as Error).message}. ` +
        'Fix the cause and re-run with --resume.',
      )
    }
    if (!result.ok) {
      await store.markPayouts(epoch, ids, 'failed', result.txHash)
      throw new PayoutAbort(
        `mintBatch reverted for chunk ${i + 1} (tx ${result.txHash}); ${ids.length} rows marked failed. ` +
        'Fix the cause and re-run with --resume.',
      )
    }
    await store.markPayouts(epoch, ids, 'confirmed', result.txHash)
    txHashes.push(result.txHash)
    minted += batch.length
    log(`  confirmed: ${result.txHash}`)
  }

  log(`Done. Epoch ${epoch}: minted to ${minted} wallets across ${txHashes.length} tx (${skipped} previously confirmed).`)
  return { epoch, dryRun: false, planned: payoutsAll.length, minted, skipped, txHashes }
}

function sum(values: bigint[]): bigint {
  return values.reduce((a, b) => a + b, 0n)
}

function printTable(
  log: (line: string) => void,
  epoch: number,
  pool: bigint,
  payouts: PayoutAmount[],
  existing: Map<string, { status: string }>,
): void {
  log('')
  log(`Payout plan — epoch ${epoch}, pool ${formatUnits(pool, 18)} POLLEN`)
  log(`${'contributor'.padEnd(14)} ${'wallet'.padEnd(44)} ${'score'.padStart(12)} ${'POLLEN'.padStart(16)}  status`)
  for (const p of payouts) {
    const status = existing.get(p.contributor_id)?.status ?? 'new'
    log(
      `${p.contributor_id.slice(0, 12).padEnd(14)} ${p.wallet_address.padEnd(44)} ` +
      `${p.score.padStart(12)} ${formatUnits(p.amountWei, 18).padStart(16)}  ${status}`,
    )
  }
  const total = sum(payouts.map(p => p.amountWei))
  log(`${'total'.padEnd(59)} ${' '.repeat(12)} ${formatUnits(total, 18).padStart(16)}  (dust stays unminted)`)
}
