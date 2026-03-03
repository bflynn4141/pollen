import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

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

const CONFIG_PATH = join(process.env.HOME ?? '~', '.pollen', 'config.json')

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
