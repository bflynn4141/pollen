/**
 * Weekly payout job: pro-rata POLLEN mint for the just-closed epoch.
 *
 * Flow:
 *   1. Target epoch = currentEpoch() - 1 (or --epoch N, which must be closed).
 *      PollenTokenV2.mintBatch only accepts the just-closed epoch, so any
 *      other closed epoch is dry-run-only.
 *   2. Assert epoch_scores rows exist (else: run the epoch-close cron first).
 *   3. Eligibility: World ID-verified contributors with a bound wallet
 *      (World ID verified and an EIP-191 binding that recovers to wallet_address).
 *   4. Quorum: at least five eligible contributors must exist. Normal runs
 *      fail closed below quorum; --dry-run returns a structured blocked result.
 *   5. amount_i = floor(epochPool(epoch) * score_i / total_score); zeros dropped.
 *   6. Idempotency: existing payouts rows for the epoch abort the run unless
 *      --resume, which skips confirmed rows and reconciles any durable Splits
 *      proposal IDs left pending by a crash.
 *   7. --dry-run prints the payout table and exits before any DB write or tx.
 *   8. Write payouts rows status='pending', create each chunk proposal, persist
 *      its ID before signing, then execute it. A confirmed receipt replaces
 *      the proposal ID with the chain tx hash.
 */
import { formatUnits, type Address } from 'viem'
import { chunk, MAX_RECIPIENTS_PER_TX } from './chunk.js'
import type { PayoutStore } from './db.js'
import { currentEpoch, epochPool } from './epoch.js'
import type { MintChain } from './mint.js'
import { computePayouts, type PayoutAmount } from './prorata.js'

export const MIN_PAYOUT_ELIGIBLE_CONTRIBUTORS = 5

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
  blocked: boolean
  blockReason: 'eligible_contributor_quorum' | null
  eligibleContributors: number
  requiredEligibleContributors: number
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
      `No epoch_scores rows for epoch ${epoch} — verify the Tuesday epoch-close cron ran, ` +
      `or invoke POST /admin/run/epoch-close?epoch=${epoch} with the Worker ADMIN_SECRET, ` +
      'then re-run the payout.',
    )
  }

  // 3-5. Eligible contributors + quorum + pro-rata amounts
  const eligible = await store.fetchEligibleScores(epoch)
  log(`Epoch ${epoch}: ${scoreCount} scored contributors, ${eligible.length} eligible (World ID verified + cryptographic wallet binding).`)
  const pool = epochPool(epoch)
  const payoutsAll = computePayouts(eligible, pool)
  const quorumMet = eligible.length >= MIN_PAYOUT_ELIGIBLE_CONTRIBUTORS
  const resultPolicy = {
    eligibleContributors: eligible.length,
    requiredEligibleContributors: MIN_PAYOUT_ELIGIBLE_CONTRIBUTORS,
  }

  // 6. Idempotency
  const existing = await store.fetchPayouts(epoch)
  const existingByContributor = new Map(existing.map(p => [p.contributor_id, p]))
  if (existing.length > 0 && !resume && !dryRun) {
    throw new PayoutAbort(
      `payouts rows already exist for epoch ${epoch} (${existing.length} rows). ` +
      'This epoch appears to be paid or in flight — pass --resume to retry unconfirmed rows.',
    )
  }
  const skipped = payoutsAll.filter(p => existingByContributor.get(p.contributor_id)?.status === 'confirmed').length

  const pendingTransactions = new Map<string, string[]>()
  for (const payout of existing) {
    if (payout.status !== 'pending' || !payout.tx_hash) continue
    const ids = pendingTransactions.get(payout.tx_hash) ?? []
    ids.push(payout.contributor_id)
    pendingTransactions.set(payout.tx_hash, ids)
  }
  const freshToMint = payoutsAll.filter(p => {
    const prior = existingByContributor.get(p.contributor_id)
    return prior?.status !== 'confirmed' && !(prior?.status === 'pending' && prior.tx_hash)
  })

  // 7. Dry run: print and exit before any write or tx. A blocked dry run is a
  // successful diagnostic result, consistent with dry-run's inspection-only
  // treatment of stale epochs and existing payout rows.
  printTable(log, epoch, pool, payoutsAll, existingByContributor)
  if (dryRun) {
    log('')
    if (!quorumMet) {
      log(`--dry-run BLOCKED: eligible-contributor quorum unmet (${eligible.length}/${MIN_PAYOUT_ELIGIBLE_CONTRIBUTORS} eligible contributors). ` +
        'No payouts would be written and no transactions would be sent.')
      return {
        epoch,
        dryRun: true,
        blocked: true,
        blockReason: 'eligible_contributor_quorum',
        ...resultPolicy,
        planned: payoutsAll.length,
        minted: 0,
        skipped,
        txHashes: [],
      }
    }
    log(`--dry-run: no payouts written, no transactions sent. Would mint to ${freshToMint.length} wallets` +
      ` in ${chunk(freshToMint).length} new tx and reconcile ${pendingTransactions.size} pending tx (${skipped} already confirmed).`)
    return {
      epoch,
      dryRun: true,
      blocked: false,
      blockReason: null,
      ...resultPolicy,
      planned: payoutsAll.length,
      minted: 0,
      skipped,
      txHashes: [],
    }
  }

  // Hard execution boundary: no payout row write, Splits proposal, signature,
  // or chain transaction can occur until the exact cryptographically-filtered
  // eligible list returned by fetchEligibleScores reaches quorum.
  if (!quorumMet) {
    throw new PayoutAbort(
      `Payout blocked: eligible-contributor quorum unmet (${eligible.length}/${MIN_PAYOUT_ELIGIBLE_CONTRIBUTORS}). ` +
      `Need ${MIN_PAYOUT_ELIGIBLE_CONTRIBUTORS - eligible.length} more scored contributor(s) with World ID verification, ` +
      'a wallet, and a valid cryptographic wallet binding.',
    )
  }

  if (freshToMint.length === 0 && pendingTransactions.size === 0) {
    log('Nothing to mint — every eligible payout is already confirmed.')
    return {
      epoch,
      dryRun: false,
      blocked: false,
      blockReason: null,
      ...resultPolicy,
      planned: payoutsAll.length,
      minted: 0,
      skipped,
      txHashes: [],
    }
  }

  const prepareMintBatch = chain.prepareMintBatch
  const executeMintBatch = chain.executeMintBatch
  if (!prepareMintBatch || !executeMintBatch) {
    throw new PayoutAbort('Mint chain does not support crash-safe proposal persistence; refusing to execute payouts.')
  }

  // 8. Write pending rows, then mint in chunks
  await store.insertPendingPayouts(epoch, freshToMint)

  const txHashes: string[] = []
  let minted = 0
  for (const [transactionId, ids] of pendingTransactions) {
    log(`Reconciling pending Splits proposal ${transactionId} (${ids.length} recipients)...`)
    let result
    try {
      result = await executeMintBatch(transactionId)
    } catch (err) {
      throw new PayoutAbort(
        `Splits proposal ${transactionId} is still pending or could not be reconciled: ${(err as Error).message}. ` +
        'Its identity remains stored; re-run with --resume rather than creating a replacement.',
      )
    }
    if (!result.ok) {
      await store.markPayouts(epoch, ids, 'failed', result.txHash)
      throw new PayoutAbort(
        `Pending Splits proposal ${transactionId} failed (tx ${result.txHash}); ${ids.length} rows marked failed. ` +
        'Fix the cause and re-run with --resume.',
      )
    }
    await store.markPayouts(epoch, ids, 'confirmed', result.txHash)
    txHashes.push(result.txHash)
    minted += ids.length
    log(`  confirmed: ${result.txHash}`)
  }

  for (const [i, batch] of chunk(freshToMint, MAX_RECIPIENTS_PER_TX).entries()) {
    const recipients = batch.map(p => p.wallet_address as Address)
    const amounts = batch.map(p => p.amountWei)
    const ids = batch.map(p => p.contributor_id)
    log(`Minting chunk ${i + 1}: ${batch.length} recipients, ${formatUnits(sum(amounts), 18)} POLLEN...`)

    let transactionId: string
    try {
      transactionId = await prepareMintBatch(recipients, amounts, epoch)
    } catch (err) {
      await store.markPayouts(epoch, ids, 'failed', null)
      throw new PayoutAbort(
        `mintBatch proposal failed for chunk ${i + 1} (${ids.length} rows marked failed): ${(err as Error).message}. ` +
        'Fix the cause and re-run with --resume.',
      )
    }

    // This is the crash-safety boundary. The proposal has not been signed, and
    // all chunk rows receive its identity atomically before execution starts.
    await store.savePendingTransaction(epoch, ids, transactionId)

    let result
    try {
      result = await executeMintBatch(transactionId)
    } catch (err) {
      throw new PayoutAbort(
        `Splits proposal ${transactionId} may still execute: ${(err as Error).message}. ` +
        'Its identity remains stored; re-run with --resume to reconcile it.',
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
  return {
    epoch,
    dryRun: false,
    blocked: false,
    blockReason: null,
    ...resultPolicy,
    planned: payoutsAll.length,
    minted,
    skipped,
    txHashes,
  }
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
