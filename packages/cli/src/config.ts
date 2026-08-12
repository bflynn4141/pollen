import { chmodSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { maybeSignWalletBinding } from './register-sign.js'

// ── Time constants ──

export const MS_PER_DAY = 86_400_000
export const MS_PER_MINUTE = 60_000
export const MS_PER_SECOND = 1_000

// ── Duration bucket thresholds (minutes) ──

export const DURATION_THRESHOLDS = {
  QUICK: 5,
  SHORT: 15,
  MEDIUM: 60,
  LONG: 180,
} as const

// ── Satisfaction score weights ──

export const SATISFACTION_WEIGHTS = {
  GIT_ACTIVITY: 15,
  LOW_FAILURE_RATE: 25,
  NO_RETRY_STORMS: 15,
  REASONABLE_DURATION: 10,
  TOOL_ENGAGEMENT: 15,
  CONSISTENT_INTENT: 10,
  CLEAN_ENDING: 10,
} as const

// ── Satisfaction signal thresholds ──

export const SATISFACTION_THRESHOLDS = {
  FAILURE_RATE_MAX: 0.2,
  MIN_DURATION_MINUTES: 2,
  MAX_DURATION_MINUTES: 240,
  INTENT_CONSISTENCY_MIN: 0.5,
} as const

// ── Paths ──

export const DB_PATH = join(process.env.HOME ?? '~', '.pollen', 'local.db')
const CONFIG_PATH = join(process.env.HOME ?? '~', '.pollen', 'config.json')

// ── Sync ──

export const SYNC_BATCH_SIZE = 100

// ── AI Models ──

export const SUBJECT_MODEL = 'claude-haiku-4-5-20251001'

/** Model used to polish the weekly Pollen Brief into plain prose. */
export const COACH_MODEL = 'claude-sonnet-5'

// ── Wallet / Identity types ──

export interface WorldIdInfo {
  nullifier_hash: string
  verification_level: string
  verified_at: string // ISO timestamp
}

export interface ParaWallet {
  wallet_id: string   // Para wallet ID (for signing requests)
  address: string     // Derived EVM address
  email: string       // Recovery email
}

export interface PollenConfig {
  contributor_id: string
  network?: {
    api_url: string
    token: string
    registered_at: string
  }
  world_id?: WorldIdInfo
  wallet_address?: string   // kept for backward compat, auto-populated from Para
  wallet_binding_sig?: string // EIP-191 sig of `pollen:register:<contributor_id>` (BYO wallets with POLLEN_PRIVATE_KEY)
  para_wallet?: ParaWallet
  /** Recipient for the weekly Pollen Brief email (set via `pollen brief --to`) */
  brief_email?: string
}

export function loadConfig(): PollenConfig | null {
  if (!existsSync(CONFIG_PATH)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as PollenConfig
  } catch {
    return null
  }
}

export function saveConfig(config: PollenConfig): void {
  const dir = dirname(CONFIG_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 })
  chmodSync(CONFIG_PATH, 0o600)
}

export function saveNetworkRegistration(
  contributorId: string,
  apiUrl: string,
  token: string,
): void {
  const config = loadConfig() ?? { contributor_id: contributorId }
  config.contributor_id = contributorId
  config.network = {
    api_url: apiUrl,
    token,
    registered_at: new Date().toISOString(),
  }
  saveConfig(config)
}

export function getOrCreateContributorId(): string {
  const existing = loadConfig()
  if (existing?.contributor_id) return existing.contributor_id

  const id = randomUUID()
  saveConfig({ contributor_id: id, ...(existing ?? {}) })
  return id
}

/** Recipient for the weekly Pollen Brief, if configured */
export function getBriefEmail(): string | null {
  return loadConfig()?.brief_email ?? null
}

/** Persist the weekly Pollen Brief recipient into ~/.pollen/config.json */
export function setBriefEmail(email: string): void {
  const config = loadConfig() ?? { contributor_id: getOrCreateContributorId() }
  config.brief_email = email
  saveConfig(config)
}

/** Validate an Ethereum address (basic checksum-agnostic check) */
export function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

/** Register a wallet address for claiming tokens */
export function registerWallet(address: string): void {
  if (!isValidAddress(address)) {
    throw new Error(`Invalid Ethereum address: ${address}`)
  }
  const config = loadConfig() ?? { contributor_id: getOrCreateContributorId() }
  config.wallet_address = address
  saveConfig(config)
}

/** Get effective wallet address (Para-derived or manually registered) */
export function getWalletAddress(): string | null {
  const config = loadConfig()
  return config?.para_wallet?.address ?? config?.wallet_address ?? null
}

export const PROXY_URL = process.env.POLLEN_PROXY_URL ?? 'https://clara-proxy.bflynn4141.workers.dev'

/** Interactive wallet setup — prompts user to choose managed or BYO wallet.
 *  Also supports non-interactive flags (--email, --address) via argv. */
export async function runInteractiveWallet(argv: string[] = process.argv): Promise<{ address: string; type: 'managed' | 'existing' }> {
  const emailFlag = argv.indexOf('--email')
  const addrFlag = argv.indexOf('--address')

  if (emailFlag !== -1 && argv[emailFlag + 1]) {
    const email = argv[emailFlag + 1]
    const { address } = await setupWallet(email)
    console.log(`\u2713 Wallet created: ${address}`)
    console.log(`  Linked to: ${email}`)
    console.log('')
    console.log('  For full wallet features (send, swap, sign):')
    console.log('    Install Clara MCP: claude mcp add clara -- npx @clara/mcp')
    return { address, type: 'managed' }
  }

  if (addrFlag !== -1 && argv[addrFlag + 1]) {
    const addr = argv[addrFlag + 1]
    if (!isValidAddress(addr)) {
      console.error(`Invalid Ethereum address: ${addr}`)
      process.exit(1)
    }
    registerWallet(addr)
    console.log(`\u2713 Wallet registered: ${addr}`)
    if (await maybeSignWalletBinding(addr)) {
      console.log('  \u2713 Wallet binding signed with POLLEN_PRIVATE_KEY (uploads on next sync).')
    }
    console.log('  Note: You\'ll need POLLEN_PRIVATE_KEY to claim tokens.')
    return { address: addr, type: 'existing' }
  }

  // Interactive
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const ask = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve))

  console.log('')
  console.log('  How do you want to set up your wallet?')
  console.log('')
  console.log('  1. Create a managed wallet (recommended)')
  console.log('     Email-based. No private keys to manage. Claim tokens with one command.')
  console.log('')
  console.log('  2. Use your own wallet')
  console.log('     Bring an existing Ethereum address. You\'ll need your private key to claim.')
  console.log('')

  const choice = await ask('  Choice [1]: ')
  const picked = choice.trim() || '1'

  if (picked === '1') {
    const email = await ask('  Email: ')
    if (!email.trim() || !email.includes('@')) {
      rl.close()
      console.error('  Invalid email.')
      process.exit(1)
    }
    console.log('')
    console.log('  Sending verification code...')
    const { sessionId } = await initWalletVerification(email.trim())
    console.log('  ✓ Code sent! Check your email.')
    console.log('')
    const code = await ask('  Verification code: ')
    rl.close()
    if (!code.trim()) {
      console.error('  No code entered.')
      process.exit(1)
    }
    const { address } = await verifyAndCreateWallet(email.trim(), code.trim(), sessionId)
    console.log('')
    console.log(`\u2713 Wallet created: ${address}`)
    console.log(`  Linked to: ${email.trim()}`)
    console.log('')
    console.log('  For full wallet features (send, swap, sign):')
    console.log('    Install Clara MCP: claude mcp add clara -- npx @clara/mcp')
    return { address, type: 'managed' }
  } else {
    const addr = await ask('  Ethereum address (0x...): ')
    rl.close()
    if (!isValidAddress(addr.trim())) {
      console.error('  Invalid Ethereum address.')
      process.exit(1)
    }
    registerWallet(addr.trim())
    console.log('')
    console.log(`\u2713 Wallet registered: ${addr.trim()}`)
    if (await maybeSignWalletBinding(addr.trim())) {
      console.log('  \u2713 Wallet binding signed with POLLEN_PRIVATE_KEY (uploads on next sync).')
    }
    console.log('  Note: You\'ll need POLLEN_PRIVATE_KEY to claim tokens.')
    return { address: addr.trim(), type: 'existing' }
  }
}

/** Step 1: Initiate email verification — Para sends OTP to the email */
export async function initWalletVerification(email: string): Promise<{ sessionId: string }> {
  const res = await fetch(`${PROXY_URL}/pollen/wallet/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to send verification code: ${text}`)
  }
  return await res.json() as { sessionId: string }
}

/** Step 2: Verify OTP code and create/recover wallet */
export async function verifyAndCreateWallet(
  email: string, code: string, sessionId: string
): Promise<{ walletId: string; address: string }> {
  const res = await fetch(`${PROXY_URL}/pollen/wallet/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, sessionId }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Verification failed: ${text}`)
  }
  const { walletId, address } = await res.json() as { walletId: string; address: string }

  // Save to config
  const config = loadConfig() ?? { contributor_id: getOrCreateContributorId() }
  config.para_wallet = { wallet_id: walletId, address, email }
  config.wallet_address = address  // backward compat
  saveConfig(config)

  return { walletId, address }
}

/** Legacy: Create or recover a Para wallet via Clara proxy (no OTP, for scripted use) */
export async function setupWallet(email: string): Promise<{ walletId: string; address: string }> {
  const res = await fetch(`${PROXY_URL}/pollen/wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Wallet setup failed: ${text}`)
  }
  const { walletId, address } = await res.json() as { walletId: string; address: string }

  // Save to config
  const config = loadConfig() ?? { contributor_id: getOrCreateContributorId() }
  config.para_wallet = { wallet_id: walletId, address, email }
  config.wallet_address = address  // backward compat
  saveConfig(config)

  return { walletId, address }
}
