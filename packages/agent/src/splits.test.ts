import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { decodeFunctionData } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { POLLEN_TOKEN_V2_ABI } from './abi.js'
import { createSplitsMintChain } from './mint.js'
import {
  createCustomTransaction, ensureLocalSignerKey, getTransaction, resolveSubaccount, whoami,
  type SplitsDriver,
} from './splits.js'

const SUBACCOUNT = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const
const TOKEN = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const
const PROPOSAL_ID = '3f0b8a1e-0000-4000-8000-000000000001'
const TX_HASH = '0x' + 'ab'.repeat(32)
const TEST_SIGNER_KEY = `0x${'11'.repeat(32)}` as const
const TEST_SIGNER_ADDRESS = privateKeyToAccount(TEST_SIGNER_KEY).address

const tempDirs: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(tempDirs.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fakeSplitsCli(): Promise<{ bin: string; statePath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'pollen-splits-test-'))
  tempDirs.push(dir)
  const bin = join(dir, 'splits')
  const statePath = join(dir, 'state.json')
  await writeFile(bin, `#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'

const [, , group, command] = process.argv
const statePath = process.env.TEST_SPLITS_STATE
const expectedAddress = process.env.TEST_SPLITS_EXPECTED_ADDRESS
let state = null
try { state = JSON.parse(await readFile(statePath, 'utf8')) } catch {}

if (group !== 'auth') process.exit(64)

if (command === 'import-key') {
  for await (const _chunk of process.stdin) {}
  if (process.env.TEST_SPLITS_IMPORT_FAILURE === 'unrelated') {
    process.stderr.write('Splits service unavailable\\n')
    process.exit(2)
  }
  process.stderr.write(\`Imported address: \${expectedAddress}\\n\`)
  if (state) {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: {
        code: 'UNKNOWN',
        message: \`A local key already exists (\${state.address}, "test"). Run 'splits auth delete-key' first if you want to replace it.\`,
      },
    }) + '\\n')
    process.exit(1)
  }
  await writeFile(statePath, JSON.stringify({ address: expectedAddress, signerId: 'signer_test' }))
  process.stdout.write(JSON.stringify({ address: expectedAddress }) + '\\n')
  process.exit(0)
}

if (command === 'whoami') {
  if (process.env.TEST_SPLITS_WHOAMI_FAILURE === '1') {
    process.stderr.write('Authentication failed\\n')
    process.exit(1)
  }
  process.stdout.write(JSON.stringify({
    ok: true,
    data: {
      data: {
        localKey: state && process.env.TEST_SPLITS_HIDE_LOCAL_KEY !== '1'
          ? { address: state.address, signerId: state.signerId ?? null }
          : null,
      },
    },
  }) + '\\n')
  process.exit(0)
}

process.exit(64)
`)
  await chmod(bin, 0o700)
  return { bin, statePath }
}

function useFakeSignerEnv(statePath: string): void {
  vi.stubEnv('SPLITS_SIGNER_KEY', TEST_SIGNER_KEY)
  vi.stubEnv('TEST_SPLITS_STATE', statePath)
  vi.stubEnv('TEST_SPLITS_EXPECTED_ADDRESS', TEST_SIGNER_ADDRESS)
}

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

describe('ensureLocalSignerKey', () => {
  it('supports sequential preflight and payout imports when the same signer is already registered', async () => {
    const { bin, statePath } = await fakeSplitsCli()
    useFakeSignerEnv(statePath)

    await ensureLocalSignerKey(bin) // preflight process
    await expect(ensureLocalSignerKey(bin)).resolves.toBeUndefined() // payout process

    const saved = JSON.parse(await readFile(statePath, 'utf8')) as { address: string; signerId: string }
    expect(saved).toEqual({ address: TEST_SIGNER_ADDRESS, signerId: 'signer_test' })
  })

  it('rejects an existing local key for a different address', async () => {
    const { bin, statePath } = await fakeSplitsCli()
    useFakeSignerEnv(statePath)
    await writeFile(statePath, JSON.stringify({
      address: '0x2222222222222222222222222222222222222222',
      signerId: 'signer_other',
    }))

    await expect(ensureLocalSignerKey(bin)).rejects.toThrow(/does not match SPLITS_SIGNER_KEY/)
  })

  it('rejects an identical local key that is not registered with Splits', async () => {
    const { bin, statePath } = await fakeSplitsCli()
    useFakeSignerEnv(statePath)
    await writeFile(statePath, JSON.stringify({ address: TEST_SIGNER_ADDRESS, signerId: null }))

    await expect(ensureLocalSignerKey(bin)).rejects.toThrow(/not registered/)
  })

  it('rejects when the existing signer cannot be found by whoami', async () => {
    const { bin, statePath } = await fakeSplitsCli()
    useFakeSignerEnv(statePath)
    await writeFile(statePath, JSON.stringify({ address: TEST_SIGNER_ADDRESS, signerId: 'signer_test' }))
    vi.stubEnv('TEST_SPLITS_HIDE_LOCAL_KEY', '1')

    await expect(ensureLocalSignerKey(bin)).rejects.toThrow(/reported no local signer/)
  })

  it('rejects when the existing signer cannot be verified because whoami fails', async () => {
    const { bin, statePath } = await fakeSplitsCli()
    useFakeSignerEnv(statePath)
    await writeFile(statePath, JSON.stringify({ address: TEST_SIGNER_ADDRESS, signerId: 'signer_test' }))
    vi.stubEnv('TEST_SPLITS_WHOAMI_FAILURE', '1')

    await expect(ensureLocalSignerKey(bin)).rejects.toThrow(/could not verify it/)
  })

  it('does not suppress unrelated import failures', async () => {
    const { bin, statePath } = await fakeSplitsCli()
    useFakeSignerEnv(statePath)
    vi.stubEnv('TEST_SPLITS_IMPORT_FAILURE', 'unrelated')

    await expect(ensureLocalSignerKey(bin)).rejects.toThrow(/Splits service unavailable/)
  })
})

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
