/**
 * On-chain mint layer — proposes mintBatch on the Splits subaccount, signs
 * headlessly, and polls to execution. Behind the MintChain interface so
 * payout logic stays unit-testable without the CLI or network.
 *
 * Per `splits accounts update-signers` / `transactions sign` help: a proposal
 * transitions CREATED -> EXECUTED; `transactions sign` auto-submits the
 * UserOp once this signature meets the account threshold.
 */
import { encodeFunctionData, type Address } from 'viem'
import { POLLEN_TOKEN_V2_ABI } from './abi.js'
import {
  createCustomTransaction, getTransaction, signTransaction,
  type SplitsDriver,
} from './splits.js'

export interface MintResult {
  txHash: string
  ok: boolean
}

export interface MintChain {
  /** Create the durable Splits proposal, but do not sign or execute it yet. */
  prepareMintBatch?(recipients: Address[], amounts: bigint[], epoch: number): Promise<string>
  /** Reconcile and, when needed, sign/poll an already-created proposal. */
  executeMintBatch?(transactionId: string): Promise<MintResult>
  /** Convenience operation for callers that do not need crash-safe persistence. */
  mintBatch(recipients: Address[], amounts: bigint[], epoch: number): Promise<MintResult>
}

export interface SplitsMintChainOptions {
  subaccount: Address
  tokenAddress: Address
  chainId?: number
  /** Poll interval / timeout for waiting on execution (test injectable). */
  pollIntervalMs?: number
  pollTimeoutMs?: number
  log?: (line: string) => void
}

const TERMINAL_FAILURES = new Set(['FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'REVERTED', 'REJECTED'])

export function createSplitsMintChain(driver: SplitsDriver, opts: SplitsMintChainOptions): MintChain {
  const chainId = opts.chainId ?? 8453 // Base
  const pollIntervalMs = opts.pollIntervalMs ?? 3000
  const pollTimeoutMs = opts.pollTimeoutMs ?? 5 * 60_000
  const log = opts.log ?? (() => {})

  async function prepareMintBatch(recipients: Address[], amounts: bigint[], epoch: number): Promise<string> {
    const data = encodeFunctionData({
      abi: POLLEN_TOKEN_V2_ABI,
      functionName: 'mintBatch',
      args: [recipients, amounts, BigInt(epoch)],
    })

    const proposal = await createCustomTransaction(driver, {
      account: opts.subaccount,
      chainId,
      calls: [{ to: opts.tokenAddress, data, value: '0' }],
      memo: `pollen payout epoch ${epoch} (${recipients.length} recipients)`,
      name: `Pollen payout epoch ${epoch}`,
    })
    log(`  proposed: ${proposal.id}`)
    return proposal.id
  }

  async function signAndPoll(transactionId: string): Promise<MintResult> {
    await signTransaction(driver, transactionId)
    log('  signed (auto-submits at threshold)')

    return pollTransaction(transactionId)
  }

  async function pollTransaction(transactionId: string): Promise<MintResult> {
    const deadline = Date.now() + pollTimeoutMs
    for (;;) {
      const tx = await getTransaction(driver, transactionId)
      if (tx.status === 'EXECUTED') {
        const txHash = tx.transactionHash ?? tx.userOpHash ?? transactionId
        return { txHash, ok: true }
      }
      if (tx.status && TERMINAL_FAILURES.has(tx.status)) {
        return { txHash: tx.transactionHash ?? tx.userOpHash ?? transactionId, ok: false }
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `splits proposal ${transactionId} not executed after ${pollTimeoutMs}ms (last status: ${tx.status ?? 'unknown'}). ` +
          'If the subaccount threshold is >1 it needs additional signatures; check the Splits web app, then re-run with --resume.',
        )
      }
      await new Promise(r => setTimeout(r, pollIntervalMs))
    }
  }

  async function executeMintBatch(transactionId: string): Promise<MintResult> {
    const tx = await getTransaction(driver, transactionId)
    if (tx.status === 'EXECUTED') {
      return { txHash: tx.transactionHash ?? tx.userOpHash ?? transactionId, ok: true }
    }
    if (tx.status && TERMINAL_FAILURES.has(tx.status)) {
      return { txHash: tx.transactionHash ?? tx.userOpHash ?? transactionId, ok: false }
    }
    // A crash can happen after proposal persistence but before signing. Signing
    // the same proposal again is safe: its identity and calldata do not change.
    if (tx.status === 'CREATED' || tx.status === 'DRAFT') {
      return signAndPoll(transactionId)
    }
    return pollTransaction(transactionId)
  }

  return {
    prepareMintBatch,
    executeMintBatch,
    async mintBatch(recipients: Address[], amounts: bigint[], epoch: number): Promise<MintResult> {
      const transactionId = await prepareMintBatch(recipients, amounts, epoch)
      return signAndPoll(transactionId)
    },
  }
}
