import { describe, it, expect, vi } from 'vitest'
import { decodeFunctionData } from 'viem'
import { POLLEN_TOKEN_V2_ABI } from './abi.js'
import { createSplitsMintChain } from './mint.js'
import {
  createCustomTransaction, getTransaction, resolveSubaccount, whoami,
  type SplitsDriver,
} from './splits.js'

const SUBACCOUNT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
const TOKEN = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const
const PROPOSAL_ID = '3f0b8a1e-0000-4000-8000-000000000001'
const TX_HASH = '0x' + 'ab'.repeat(32)

type ToolHandler = (args: Record<string, unknown>) => unknown

function fakeDriver(handlers: Record<string, ToolHandler>) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const driver: SplitsDriver = {
    callTool: vi.fn(async (name, args) => {
      calls.push({ name, args })
      const handler = handlers[name]
      if (!handler) throw new Error(`unexpected tool call: ${name}`)
      return handler(args)
    }),
    close: vi.fn(),
  }
  return { driver, calls }
}

describe('resolveSubaccount', () => {
  it('verifies a 0x address via accounts_get', async () => {
    const { driver, calls } = fakeDriver({ accounts_get: () => ({ address: SUBACCOUNT }) })
    const address = await resolveSubaccount(driver, SUBACCOUNT)
    expect(address).toBe(SUBACCOUNT)
    expect(calls).toEqual([{ name: 'accounts_get', args: { address: SUBACCOUNT } }])
  })

  it('resolves a name via accounts_list (case-insensitive)', async () => {
    const { driver } = fakeDriver({
      accounts_list: () => [
        { name: 'Treasury', address: '0x' + '11'.repeat(20) },
        { name: 'Pollen-Payout', address: SUBACCOUNT },
      ],
    })
    expect(await resolveSubaccount(driver, 'pollen-payout')).toBe(SUBACCOUNT)
  })

  it('supports { accounts: [...] } shaped list responses', async () => {
    const { driver } = fakeDriver({
      accounts_list: () => ({ accounts: [{ name: 'pollen-payout', address: SUBACCOUNT }] }),
    })
    expect(await resolveSubaccount(driver, 'pollen-payout')).toBe(SUBACCOUNT)
  })

  it('throws a create hint when the name is missing', async () => {
    const { driver } = fakeDriver({ accounts_list: () => [] })
    await expect(resolveSubaccount(driver, 'pollen-payout')).rejects.toThrow(/accounts create/)
  })
})

describe('whoami', () => {
  it('reports a registered local signing key', async () => {
    const { driver } = fakeDriver({ auth_whoami: () => ({ org: 'pollen', localKey: { signerId: 'sig_1' } }) })
    expect((await whoami(driver)).localKeyRegistered).toBe(true)
  })

  it('reports a registered local signing key from the CLI data envelope', async () => {
    const { driver } = fakeDriver({
      auth_whoami: () => ({ data: { orgName: 'Pollen', localKey: { signerId: 'sig_1' } } }),
    })
    expect((await whoami(driver)).localKeyRegistered).toBe(true)
  })

  it('reports an unregistered or missing local key', async () => {
    const { driver } = fakeDriver({ auth_whoami: () => ({ org: 'pollen', localKey: { signerId: null } }) })
    expect((await whoami(driver)).localKeyRegistered).toBe(false)
    const missing = fakeDriver({ auth_whoami: () => ({ org: 'pollen' }) })
    expect((await whoami(missing.driver)).localKeyRegistered).toBe(false)
  })
})

describe('createCustomTransaction / getTransaction parsing', () => {
  it('extracts the proposal id from flat and nested shapes', async () => {
    const flat = fakeDriver({ transactions_create_custom: () => ({ id: PROPOSAL_ID }) })
    expect((await createCustomTransaction(flat.driver, { account: SUBACCOUNT, chainId: 8453, calls: [] })).id).toBe(PROPOSAL_ID)

    const nested = fakeDriver({ transactions_create_custom: () => ({ transaction: { id: PROPOSAL_ID } }) })
    expect((await createCustomTransaction(nested.driver, { account: SUBACCOUNT, chainId: 8453, calls: [] })).id).toBe(PROPOSAL_ID)
  })

  it('throws when no id is present', async () => {
    const { driver } = fakeDriver({ transactions_create_custom: () => ({ ok: true }) })
    await expect(createCustomTransaction(driver, { account: SUBACCOUNT, chainId: 8453, calls: [] }))
      .rejects.toThrow(/no proposal id/)
  })

  it('normalizes status and hash fields', async () => {
    const { driver } = fakeDriver({
      transactions_get: () => ({ transaction: { status: 'executed', transactionHash: TX_HASH } }),
    })
    const tx = await getTransaction(driver, PROPOSAL_ID)
    expect(tx.status).toBe('EXECUTED')
    expect(tx.transactionHash).toBe(TX_HASH)
  })
})

describe('createSplitsMintChain', () => {
  const recipients = ['0x' + '11'.repeat(20), '0x' + '22'.repeat(20)] as `0x${string}`[]
  const amounts = [100n, 200n]

  function chainWith(handlers: Record<string, ToolHandler>) {
    const fake = fakeDriver(handlers)
    const chain = createSplitsMintChain(fake.driver, {
      subaccount: SUBACCOUNT,
      tokenAddress: TOKEN,
      pollIntervalMs: 1,
      pollTimeoutMs: 200,
    })
    return { ...fake, chain }
  }

  it('proposes correctly-encoded mintBatch calldata, signs, and polls to EXECUTED', async () => {
    const statuses = ['CREATED', 'EXECUTED']
    let signCalled = false
    const { chain, calls } = chainWith({
      transactions_create_custom: (args) => {
        expect(args.account).toBe(SUBACCOUNT)
        expect(args.chainId).toBe(8453)
        const callList = args.calls as Array<{ to: string; data: `0x${string}`; value: string }>
        expect(callList).toHaveLength(1)
        expect(callList[0].to).toBe(TOKEN)
        expect(callList[0].value).toBe('0')
        const decoded = decodeFunctionData({ abi: POLLEN_TOKEN_V2_ABI, data: callList[0].data })
        expect(decoded.functionName).toBe('mintBatch')
        expect(decoded.args).toEqual([recipients, amounts, 7n])
        return { id: PROPOSAL_ID }
      },
      transactions_sign: (args) => {
        expect(args.id).toBe(PROPOSAL_ID)
        signCalled = true
        return { submitted: true, userOpHash: '0x' + 'cd'.repeat(32) }
      },
      transactions_get: () => ({ status: statuses.shift() ?? 'EXECUTED', transactionHash: TX_HASH }),
    })

    const result = await chain.mintBatch(recipients, amounts, 7)
    expect(signCalled).toBe(true)
    expect(result).toEqual({ txHash: TX_HASH, ok: true })
    // propose -> sign -> poll(s)
    expect(calls.map(c => c.name).slice(0, 2)).toEqual(['transactions_create_custom', 'transactions_sign'])
  })

  it('returns ok=false on a terminal failure status', async () => {
    const { chain } = chainWith({
      transactions_create_custom: () => ({ id: PROPOSAL_ID }),
      transactions_sign: () => ({}),
      transactions_get: () => ({ status: 'FAILED', transactionHash: TX_HASH }),
    })
    expect(await chain.mintBatch(recipients, amounts, 7)).toEqual({ txHash: TX_HASH, ok: false })
  })

  it('falls back to userOpHash then proposal id when no tx hash is reported', async () => {
    const { chain } = chainWith({
      transactions_create_custom: () => ({ id: PROPOSAL_ID }),
      transactions_sign: () => ({}),
      transactions_get: () => ({ status: 'EXECUTED', userOpHash: '0x' + 'ef'.repeat(32) }),
    })
    expect((await chain.mintBatch(recipients, amounts, 7)).txHash).toBe('0x' + 'ef'.repeat(32))
  })

  it('times out with a --resume hint when the proposal never executes', async () => {
    const { chain } = chainWith({
      transactions_create_custom: () => ({ id: PROPOSAL_ID }),
      transactions_sign: () => ({}),
      transactions_get: () => ({ status: 'CREATED' }),
    })
    await expect(chain.mintBatch(recipients, amounts, 7)).rejects.toThrow(/--resume/)
  })

  it('propagates proposal errors without signing', async () => {
    const { chain, calls } = chainWith({
      transactions_create_custom: () => { throw new Error('splits transactions create custom: Account not found') },
    })
    await expect(chain.mintBatch(recipients, amounts, 7)).rejects.toThrow(/Account not found/)
    expect(calls.map(c => c.name)).toEqual(['transactions_create_custom'])
  })
})
