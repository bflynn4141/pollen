import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

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
  world_id?: WorldIdInfo
  wallet_address?: string   // kept for backward compat, auto-populated from Para
  para_wallet?: ParaWallet
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
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
}

export function getOrCreateContributorId(): string {
  const existing = loadConfig()
  if (existing?.contributor_id) return existing.contributor_id

  const id = randomUUID()
  saveConfig({ contributor_id: id, ...(existing ?? {}) })
  return id
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

/** Create or recover a Para wallet via Clara proxy */
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
