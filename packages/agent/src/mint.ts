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

  return {
    async mintBatch(recipients: Address[], amounts: bigint[], epoch: number): Promise<MintResult> {
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

      await signTransaction(driver, proposal.id)
      log('  signed (auto-submits at threshold)')

      const deadline = Date.now() + pollTimeoutMs
      for (;;) {
        const tx = await getTransaction(driver, proposal.id)
        if (tx.status === 'EXECUTED') {
          const txHash = tx.transactionHash ?? tx.userOpHash ?? proposal.id
          return { txHash, ok: true }
        }
        if (tx.status && TERMINAL_FAILURES.has(tx.status)) {
          return { txHash: tx.transactionHash ?? tx.userOpHash ?? proposal.id, ok: false }
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `splits proposal ${proposal.id} not executed after ${pollTimeoutMs}ms (last status: ${tx.status ?? 'unknown'}). ` +
            'If the subaccount threshold is >1 it needs additional signatures; check the Splits web app, then re-run with --resume.',
          )
        }
        await new Promise(r => setTimeout(r, pollIntervalMs))
      }
    },
  }
}
