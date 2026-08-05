/**
 * Splits CLI driver — the payout signer is a Splits SUBACCOUNT (ERC-4337
 * smart account) holding MINTER_ROLE on PollenTokenV2. The job proposes the
 * mintBatch call on the subaccount and headless-signs it with the registered
 * local EOA; the CLI auto-submits the UserOp once threshold is met.
 *
 * Transport: the CLI's plain argv mode cannot express `transactions create
 * custom --calls` (its arg parser only coerces number/boolean, so an
 * array-of-objects flag is unrepresentable — verified against the installed
 * package source). The CLI's supported programmatic surface for structured
 * args is its MCP stdio mode (`splits --mcp`), so this driver spawns that and
 * speaks minimal JSON-RPC: `initialize` -> `tools/call`. Successful tool
 * results arrive as JSON.stringify(data) in content[0].text; failures set
 * isError with a plain message.
 *
 * Env:
 *   SPLITS_API_KEY     — scoped API key (write scope for proposing/signing)
 *   SPLITS_SUBACCOUNT  — subaccount address (0x...) or name
 *   SPLITS_SIGNER_KEY  — optional EOA private key; imported into the local
 *                        keystore (via `splits auth import-key` on stdin)
 *                        before signing. Needed on fresh CI runners.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

/** Raw EVM call as `splits transactions create custom` expects it. */
export interface SplitsCall {
  to: string
  data: string
  value: string
}

/**
 * The narrow CLI surface the payout job uses. Tests mock this boundary.
 */
export interface SplitsDriver {
  /** Call a splits tool by MCP name (e.g. 'transactions_create_custom'). */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>
  close(): void
}

const SPLITS_BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', 'splits')
const DEFAULT_TIMEOUT_MS = 60_000

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Spawns `splits --mcp` and speaks newline-delimited JSON-RPC over stdio.
 */
export class SplitsMcpDriver implements SplitsDriver {
  private child: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1
  private initialized: Promise<void> | null = null
  private stderrTail: string[] = []

  constructor(
    private readonly bin: string = SPLITS_BIN,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  private ensureStarted(): Promise<void> {
    if (this.initialized) return this.initialized
    const child = spawn(this.bin, ['--mcp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })
    this.child = child
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (chunk: string) => {
      this.stderrTail = [...this.stderrTail, chunk].slice(-20)
    })
    child.on('error', (err) => this.failAll(new Error(`splits CLI failed to start (${this.bin}): ${err.message}`)))
    child.on('exit', (code) => {
      if (this.pending.size > 0) {
        this.failAll(new Error(`splits CLI exited with code ${code}: ${this.stderrTail.join('')}`))
      }
    })

    const rl = createInterface({ input: child.stdout })
    rl.on('line', (line) => this.onLine(line))

    this.initialized = (async () => {
      const result = await this.request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'pollen-agent', version: '0.0.1' },
      })
      if (!result || typeof result !== 'object') {
        throw new Error('splits --mcp: unexpected initialize response')
      }
      this.notify('notifications/initialized')
    })()
    return this.initialized
  }

  private onLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg: { id?: number; result?: unknown; error?: { message?: string } }
    try {
      msg = JSON.parse(trimmed)
    } catch {
      return // non-JSON noise
    }
    if (typeof msg.id !== 'number') return
    const entry = this.pending.get(msg.id)
    if (!entry) return
    this.pending.delete(msg.id)
    clearTimeout(entry.timer)
    if (msg.error) {
      entry.reject(new Error(`splits CLI RPC error: ${msg.error.message ?? 'unknown'}`))
    } else {
      entry.resolve(msg.result)
    }
  }

  private failAll(err: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(err)
    }
    this.pending.clear()
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.child?.stdin.writable) {
      throw new Error('splits CLI process is not running')
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  private notify(method: string): void {
    this.send({ jsonrpc: '2.0', method })
  }

  private request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`splits CLI request timed out after ${this.timeoutMs}ms: ${method}`))
      }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })
      } catch (err) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(err as Error)
      }
    })
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureStarted()
    const result = await this.request('tools/call', { name, arguments: args }) as {
      content?: Array<{ type: string; text?: string }>
      isError?: boolean
    }
    const text = result?.content?.find(c => c.type === 'text')?.text ?? ''
    if (result?.isError) {
      throw new Error(`splits ${name.replaceAll('_', ' ')}: ${text || 'command failed'}`)
    }
    try {
      return JSON.parse(text)
    } catch {
      return text // some tools may return plain text
    }
  }

  close(): void {
    this.failAll(new Error('splits CLI driver closed'))
    this.child?.stdin.end()
    this.child?.kill()
    this.child = null
    this.initialized = null
  }
}

/**
 * Import SPLITS_SIGNER_KEY into the CLI's local keystore (fresh CI runners
 * have none). Uses plain argv mode with the key piped over stdin, matching
 * the CLI's documented `echo $PRIVATE_KEY | splits auth import-key` flow.
 * A no-op when the env var is unset (assumes a pre-provisioned local key).
 */
export async function ensureLocalSignerKey(bin: string = SPLITS_BIN): Promise<void> {
  const key = process.env.SPLITS_SIGNER_KEY
  if (!key) return
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, ['auth', 'import-key', '--format', 'json'], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env })
    let stderr = ''
    child.stderr.setEncoding('utf-8')
    child.stderr.on('data', (c: string) => { stderr += c })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`splits auth import-key failed (exit ${code}): ${stderr.split('\n')[0]}`))
    })
    child.stdin.write(`${key}\n`)
    child.stdin.end()
  })
}

// ── Typed helpers over the driver ───────────────────────

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`splits: unexpected ${context} response shape: ${JSON.stringify(value)?.slice(0, 200)}`)
  }
  return value as Record<string, unknown>
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return null
}

export interface Whoami {
  raw: Record<string, unknown>
  localKeyRegistered: boolean
}

export async function whoami(driver: SplitsDriver): Promise<Whoami> {
  const raw = asRecord(await driver.callTool('auth_whoami', {}), 'auth whoami')
  const data = raw.data
  const identity = data !== null && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : raw
  const localKey = identity.localKey as Record<string, unknown> | null | undefined
  return { raw, localKeyRegistered: !!(localKey && localKey.signerId) }
}

/**
 * Resolve SPLITS_SUBACCOUNT (address or name) to its onchain address.
 */
export async function resolveSubaccount(driver: SplitsDriver, subaccount: string): Promise<`0x${string}`> {
  if (/^0x[0-9a-fA-F]{40}$/.test(subaccount)) {
    // Verify it exists in the org
    await driver.callTool('accounts_get', { address: subaccount })
    return subaccount as `0x${string}`
  }
  const listed = await driver.callTool('accounts_list', {})
  const accounts: unknown[] = Array.isArray(listed)
    ? listed
    : (asRecord(listed, 'accounts list').accounts as unknown[] | undefined)
      ?? (asRecord(listed, 'accounts list').data as unknown[] | undefined)
      ?? []
  for (const entry of accounts) {
    if (entry === null || typeof entry !== 'object') continue
    const rec = entry as Record<string, unknown>
    const name = pickString(rec, ['name'])
    if (name?.toLowerCase() === subaccount.toLowerCase()) {
      const address = pickString(rec, ['address', 'accountAddress'])
      if (address && /^0x[0-9a-fA-F]{40}$/.test(address)) return address as `0x${string}`
    }
  }
  throw new Error(
    `Splits subaccount "${subaccount}" not found in your org. ` +
    'Create it with `splits accounts create --name <name> --eoa-signer-ids <id> --threshold 1` or set SPLITS_SUBACCOUNT to its 0x address.',
  )
}

export interface ProposalRef {
  id: string
  raw: Record<string, unknown>
}

/** Propose raw EVM calls on the subaccount (transactions create custom). */
export async function createCustomTransaction(
  driver: SplitsDriver,
  params: { account: string; chainId: number; calls: SplitsCall[]; memo?: string; name?: string },
): Promise<ProposalRef> {
  const raw = asRecord(
    await driver.callTool('transactions_create_custom', { ...params }),
    'transactions create custom',
  )
  // The proposal id is what `transactions sign` / `transactions get` take.
  const nested = (raw.transaction ?? raw.proposal) as Record<string, unknown> | undefined
  const id = pickString(raw, ['id', 'transactionId', 'proposalId'])
    ?? (nested ? pickString(nested, ['id', 'transactionId', 'proposalId']) : null)
  if (!id) {
    throw new Error(`splits transactions create custom: no proposal id in response: ${JSON.stringify(raw).slice(0, 300)}`)
  }
  return { id, raw }
}

/** Headless-sign; auto-submits the UserOp when threshold is met. */
export async function signTransaction(driver: SplitsDriver, id: string): Promise<Record<string, unknown>> {
  return asRecord(await driver.callTool('transactions_sign', { id }), 'transactions sign')
}

export interface TransactionStatus {
  status: string | null
  transactionHash: string | null
  userOpHash: string | null
  raw: Record<string, unknown>
}

export async function getTransaction(driver: SplitsDriver, id: string): Promise<TransactionStatus> {
  const raw = asRecord(await driver.callTool('transactions_get', { id }), 'transactions get')
  const nested = (raw.transaction ?? raw.proposal) as Record<string, unknown> | undefined
  const source = nested ?? raw
  return {
    status: pickString(source, ['status', 'state'])?.toUpperCase() ?? null,
    transactionHash: pickString(source, ['transactionHash', 'txHash']),
    userOpHash: pickString(source, ['userOpHash']),
    raw,
  }
}
