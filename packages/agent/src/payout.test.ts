import { describe, it, expect, vi } from 'vitest'
import type { Address } from 'viem'
import type { ExistingPayout, PayoutStore } from './db.js'
import { EPOCH_ZERO_MS, EPOCH_LENGTH_MS, epochPool } from './epoch.js'
import type { MintChain } from './mint.js'
import { PayoutAbort, runPayout } from './payout.js'
import type { EligibleScore, PayoutAmount } from './prorata.js'

// A clock inside epoch 3 => the just-closed (payable) epoch is 2.
const NOW_EPOCH_3 = EPOCH_ZERO_MS + 2 * EPOCH_LENGTH_MS + 1000
const PAYABLE = 2

const WALLET_A = '0x1111111111111111111111111111111111111111'
const WALLET_B = '0x2222222222222222222222222222222222222222'
const WALLET_C = '0x3333333333333333333333333333333333333333'

function scores(): EligibleScore[] {
  return [
    { contributor_id: 'aaa', wallet_address: WALLET_A, score: '100' },
    { contributor_id: 'bbb', wallet_address: WALLET_B, score: '200' },
    { contributor_id: 'ccc', wallet_address: WALLET_C, score: '100' },
  ]
}

interface MockStoreState {
  scoreCount?: number
  eligible?: EligibleScore[]
  existing?: ExistingPayout[]
}

function mockStore(state: MockStoreState = {}) {
  const inserted: Array<{ epoch: number; rows: PayoutAmount[] }> = []
  const saved: Array<{ epoch: number; ids: string[]; transactionId: string }> = []
  const marked: Array<{ epoch: number; ids: string[]; status: string; txHash: string | null }> = []
  const store: PayoutStore = {
    countEpochScores: vi.fn(async () => state.scoreCount ?? (state.eligible ?? scores()).length),
    fetchEligibleScores: vi.fn(async () => state.eligible ?? scores()),
    fetchPayouts: vi.fn(async () => state.existing ?? []),
    insertPendingPayouts: vi.fn(async (epoch, rows) => { inserted.push({ epoch, rows }) }),
    savePendingTransaction: vi.fn(async (epoch, ids, transactionId) => {
      saved.push({ epoch, ids, transactionId })
      for (const row of (state.existing ?? []).filter(row => ids.includes(row.contributor_id))) {
        row.status = 'pending'
        row.tx_hash = transactionId
      }
    }),
    markPayouts: vi.fn(async (epoch, ids, status, txHash) => { marked.push({ epoch, ids, status, txHash }) }),
  }
  return { store, inserted, saved, marked }
}

function mockChain(behavior: 'ok' | 'revert' | 'throw' = 'ok') {
  const calls: Array<{ recipients: Address[]; amounts: bigint[]; epoch: number }> = []
  const proposals = new Map<string, { recipients: Address[]; amounts: bigint[]; epoch: number; result?: { txHash: string; ok: boolean } }>()
  const prepareMintBatch = vi.fn(async (recipients: Address[], amounts: bigint[], epoch: number) => {
    if (behavior === 'throw') throw new Error('rpc unreachable')
    const transactionId = `proposal-${proposals.size + 1}`
    proposals.set(transactionId, { recipients, amounts, epoch })
    return transactionId
  })
  const executeMintBatch = vi.fn(async (transactionId: string) => {
    const proposal = proposals.get(transactionId)
    if (!proposal) throw new Error(`unknown proposal ${transactionId}`)
    if (proposal.result) return proposal.result
    const { recipients, amounts, epoch } = proposal
    calls.push({ recipients, amounts, epoch })
    proposal.result = { txHash: `0xtx${calls.length}`, ok: behavior === 'ok' }
    return proposal.result
  })
  const chain: MintChain = {
    prepareMintBatch,
    executeMintBatch,
    mintBatch: vi.fn(async (recipients, amounts, epoch) => {
      const transactionId = await prepareMintBatch(recipients, amounts, epoch)
      return executeMintBatch(transactionId)
    }),
  }
  return { chain, calls }
}

const silent = () => {}

describe('runPayout epoch selection', () => {
  it('targets currentEpoch() - 1 by default', async () => {
    const { store } = mockStore()
    const { chain, calls } = mockChain()
    const result = await runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3 })
    expect(result.epoch).toBe(PAYABLE)
    expect(calls[0].epoch).toBe(PAYABLE)
  })

  it('refuses an epoch that has not closed yet', async () => {
    const { store } = mockStore()
    const { chain } = mockChain()
    await expect(runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3, epoch: 3 }))
      .rejects.toThrow(/not closed/)
  })

  it('refuses a stale closed epoch unless --dry-run (contract only pays the just-closed one)', async () => {
    const { store } = mockStore()
    const { chain } = mockChain()
    const nowEpoch5 = EPOCH_ZERO_MS + 4 * EPOCH_LENGTH_MS + 1000
    await expect(runPayout({ store, chain, log: silent }, { nowMs: nowEpoch5, epoch: 2 }))
      .rejects.toThrow(/just-closed/)
    // ...but dry-run may inspect it
    const result = await runPayout({ store, chain, log: silent }, { nowMs: nowEpoch5, epoch: 2, dryRun: true })
    expect(result.dryRun).toBe(true)
  })

  it('aborts before epoch 1 has closed', async () => {
    const { store } = mockStore()
    const { chain } = mockChain()
    await expect(runPayout({ store, chain, log: silent }, { nowMs: EPOCH_ZERO_MS + 1000 }))
      .rejects.toThrow(/No epoch has closed/)
  })
})

describe('runPayout scoring precondition', () => {
  it('exits telling you to run epoch-close when no scores exist', async () => {
    const { store } = mockStore({ scoreCount: 0 })
    const { chain, calls } = mockChain()
    await expect(runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3 }))
      .rejects.toThrow(/epoch-close/)
    expect(calls).toHaveLength(0)
  })
})

describe('runPayout pro-rata + minting', () => {
  it('mints floor(pool * score / total) per eligible contributor', async () => {
    const { store, marked } = mockStore()
    const { chain, calls } = mockChain()
    await runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3 })

    const pool = epochPool(PAYABLE)
    expect(calls).toHaveLength(1)
    expect(calls[0].recipients).toEqual([WALLET_A, WALLET_B, WALLET_C])
    expect(calls[0].amounts).toEqual([pool / 4n, pool / 2n, pool / 4n])
    expect(marked).toEqual([
      { epoch: PAYABLE, ids: ['aaa', 'bbb', 'ccc'], status: 'confirmed', txHash: '0xtx1' },
    ])
  })

  it('persists the proposal identity before signing or execution', async () => {
    const order: string[] = []
    const { store } = mockStore()
    const insertSpy = store.insertPendingPayouts as ReturnType<typeof vi.fn>
    insertSpy.mockImplementation(async () => { order.push('insert') })
    const saveSpy = store.savePendingTransaction as ReturnType<typeof vi.fn>
    saveSpy.mockImplementation(async () => { order.push('save') })
    const chain: MintChain = {
      prepareMintBatch: vi.fn(async () => { order.push('prepare'); return 'proposal-1' }),
      executeMintBatch: vi.fn(async () => { order.push('execute'); return { txHash: '0xtx1', ok: true } }),
      mintBatch: vi.fn(async () => { throw new Error('unused') }),
    }
    await runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3 })
    expect(order).toEqual(['insert', 'prepare', 'save', 'execute'])
  })

  it('chunks mintBatch at 100 recipients per tx', async () => {
    const eligible: EligibleScore[] = Array.from({ length: 205 }, (_, i) => ({
      contributor_id: `c${i}`,
      wallet_address: `0x${String(i).padStart(40, '0')}`,
      score: '1',
    }))
    const { store, marked } = mockStore({ eligible })
    const { chain, calls } = mockChain()
    const result = await runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3 })

    expect(calls.map(c => c.recipients.length)).toEqual([100, 100, 5])
    expect(result.minted).toBe(205)
    expect(result.txHashes).toEqual(['0xtx1', '0xtx2', '0xtx3'])
    expect(marked.map(m => m.ids.length)).toEqual([100, 100, 5])
  })

  it('marks the chunk failed and aborts when the tx reverts', async () => {
    const { store, marked } = mockStore()
    const { chain } = mockChain('revert')
    await expect(runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3 }))
      .rejects.toThrow(PayoutAbort)
    expect(marked).toEqual([
      { epoch: PAYABLE, ids: ['aaa', 'bbb', 'ccc'], status: 'failed', txHash: '0xtx1' },
    ])
  })

  it('marks the chunk failed (no tx hash) when the send throws', async () => {
    const { store, marked } = mockStore()
    const { chain } = mockChain('throw')
    await expect(runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3 }))
      .rejects.toThrow(/--resume/)
    expect(marked).toEqual([
      { epoch: PAYABLE, ids: ['aaa', 'bbb', 'ccc'], status: 'failed', txHash: null },
    ])
  })
})

describe('runPayout idempotency', () => {
  const existingConfirmed: ExistingPayout[] = [
    { contributor_id: 'aaa', wallet_address: WALLET_A, amount: '25000', tx_hash: '0xold', status: 'confirmed' },
  ]

  it('aborts when payouts rows already exist and --resume is not set', async () => {
    const { store } = mockStore({ existing: existingConfirmed })
    const { chain, calls } = mockChain()
    await expect(runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3 }))
      .rejects.toThrow(/--resume/)
    expect(calls).toHaveLength(0)
  })

  it('--resume skips confirmed rows and retries the rest', async () => {
    const existing: ExistingPayout[] = [
      ...existingConfirmed,
      { contributor_id: 'bbb', wallet_address: WALLET_B, amount: '50000', tx_hash: null, status: 'failed' },
      { contributor_id: 'ccc', wallet_address: WALLET_C, amount: '25000', tx_hash: null, status: 'pending' },
    ]
    const { store, marked } = mockStore({ existing })
    const { chain, calls } = mockChain()
    const result = await runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3, resume: true })

    expect(calls).toHaveLength(1)
    expect(calls[0].recipients).toEqual([WALLET_B, WALLET_C]) // aaa (confirmed) skipped
    expect(result.skipped).toBe(1)
    expect(result.minted).toBe(2)
    expect(marked).toEqual([
      { epoch: PAYABLE, ids: ['bbb', 'ccc'], status: 'confirmed', txHash: '0xtx1' },
    ])
  })

  it('--resume with everything confirmed mints nothing', async () => {
    const existing: ExistingPayout[] = scores().map(s => ({
      contributor_id: s.contributor_id,
      wallet_address: s.wallet_address,
      amount: '1',
      tx_hash: '0xold',
      status: 'confirmed',
    }))
    const { store, inserted } = mockStore({ existing })
    const { chain, calls } = mockChain()
    const result = await runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3, resume: true })
    expect(calls).toHaveLength(0)
    expect(inserted).toHaveLength(0)
    expect(result.minted).toBe(0)
    expect(result.skipped).toBe(3)
  })

  it('does not mint a chunk twice when confirmation persistence crashes after execution', async () => {
    const existing: ExistingPayout[] = []
    let failConfirmationWrite = true
    const { store } = mockStore({ existing })
    ;(store.insertPendingPayouts as ReturnType<typeof vi.fn>).mockImplementation(async (epoch, rows) => {
      for (const row of rows) {
        existing.push({
          contributor_id: row.contributor_id,
          wallet_address: row.wallet_address,
          amount: '0',
          tx_hash: null,
          status: 'pending',
        })
      }
    })
    ;(store.markPayouts as ReturnType<typeof vi.fn>).mockImplementation(
      async (_epoch, ids, status, txHash) => {
        if (status === 'confirmed' && failConfirmationWrite) {
          failConfirmationWrite = false
          throw new Error('database unavailable after receipt')
        }
        for (const row of existing.filter(row => ids.includes(row.contributor_id))) {
          row.status = status
          row.tx_hash = txHash
        }
      },
    )
    const { chain, calls } = mockChain()

    await expect(runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3 }))
      .rejects.toThrow(/database unavailable/)
    await runPayout({ store, chain, log: silent }, { nowMs: NOW_EPOCH_3, resume: true })

    expect(calls).toHaveLength(1)
  })
})

describe('runPayout --dry-run', () => {
  it('prints the plan and never writes or mints', async () => {
    const lines: string[] = []
    const { store, inserted, marked } = mockStore()
    const { chain, calls } = mockChain()
    const result = await runPayout(
      { store, chain, log: l => lines.push(l) },
      { nowMs: NOW_EPOCH_3, dryRun: true },
    )
    expect(result.dryRun).toBe(true)
    expect(result.minted).toBe(0)
    expect(calls).toHaveLength(0)
    expect(inserted).toHaveLength(0)
    expect(marked).toHaveLength(0)
    const table = lines.join('\n')
    expect(table).toContain(WALLET_A)
    expect(table).toContain(WALLET_B)
    expect(table).toContain('--dry-run')
  })

  it('does not abort on existing rows, annotating them instead', async () => {
    const { store } = mockStore({
      existing: [{ contributor_id: 'aaa', wallet_address: WALLET_A, amount: '25000', tx_hash: '0xold', status: 'confirmed' }],
    })
    const { chain } = mockChain()
    const lines: string[] = []
    const result = await runPayout(
      { store, chain, log: l => lines.push(l) },
      { nowMs: NOW_EPOCH_3, dryRun: true },
    )
    expect(result.skipped).toBe(1)
    expect(lines.join('\n')).toContain('confirmed')
  })
})
