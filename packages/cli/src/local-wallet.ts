import { spawnSync } from 'node:child_process'
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'
import { registrationMessage } from './register-sign.js'

const KEYCHAIN_SERVICE = 'org.pollen.local-wallet'
export const LOCAL_WALLET_PATH = join(process.env.HOME ?? '~', '.pollen', 'local-wallet.json')

export interface EncryptedPrivateKey {
  cipher: 'aes-256-gcm'
  iv: string
  ciphertext: string
  auth_tag: string
}

export interface LocalWalletFile {
  version: 1
  address: string
  key_store: 'macos-keychain'
  encrypted_private_key: EncryptedPrivateKey
}

export interface LocalWalletKeychain {
  get(account: string): string | null
  set(account: string, secret: string): void
}

export interface LocalWalletResult {
  address: `0x${string}`
  signature: Hex
  created: boolean
  walletPath: string
}

interface LocalWalletOptions {
  walletPath?: string
  keychain?: LocalWalletKeychain
  generatePrivateKey?: () => `0x${string}`
}

function assertWrappingKey(key: Buffer): void {
  if (key.length !== 32) throw new Error('Local wallet wrapping key must be 32 bytes')
}

export function encryptPrivateKey(
  privateKey: `0x${string}`,
  wrappingKey: Buffer,
): EncryptedPrivateKey {
  assertWrappingKey(wrappingKey)
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error('Invalid EVM private key')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', wrappingKey, iv)
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(privateKey.slice(2), 'hex')),
    cipher.final(),
  ])
  return {
    cipher: 'aes-256-gcm',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64'),
  }
}

export function decryptPrivateKey(
  encrypted: EncryptedPrivateKey,
  wrappingKey: Buffer,
): `0x${string}` {
  assertWrappingKey(wrappingKey)
  if (encrypted.cipher !== 'aes-256-gcm') throw new Error('Unsupported local wallet cipher')
  const decipher = createDecipheriv(
    'aes-256-gcm',
    wrappingKey,
    Buffer.from(encrypted.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(encrypted.auth_tag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ])
  if (plaintext.length !== 32) throw new Error('Invalid decrypted EVM private key')
  return `0x${plaintext.toString('hex')}`
}

function runSecurity(args: string[]): string {
  const result = spawnSync('/usr/bin/security', args, {
    encoding: 'utf8',
    timeout: 10_000,
  })
  if (result.status !== 0) throw new Error('macOS Keychain operation failed')
  return result.stdout.trim()
}

export const macOSKeychain: LocalWalletKeychain = {
  get(account) {
    if (process.platform !== 'darwin') {
      throw new Error('Local encrypted wallets currently require macOS Keychain')
    }
    const result = spawnSync('/usr/bin/security', [
      'find-generic-password',
      '-a', account,
      '-s', KEYCHAIN_SERVICE,
      '-w',
    ], { encoding: 'utf8', timeout: 10_000 })
    if (result.status === 44) return null
    if (result.status !== 0) throw new Error('Could not read the local wallet wrapping key from macOS Keychain')
    return result.stdout.trim()
  },
  set(account, secret) {
    if (process.platform !== 'darwin') {
      throw new Error('Local encrypted wallets currently require macOS Keychain')
    }
    // `security` cannot accept a non-empty value through stdin in
    // non-interactive mode. This argument is the random AES wrapping key, not
    // the wallet private key; the private key exists only in memory and the
    // encrypted wallet file.
    runSecurity([
      'add-generic-password',
      '-U',
      '-a', account,
      '-s', KEYCHAIN_SERVICE,
      '-l', 'Pollen local wallet',
      '-w', secret,
    ])
  },
}

function parseWalletFile(path: string): LocalWalletFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`Could not read encrypted local wallet at ${path}`)
  }
  const wallet = parsed as Partial<LocalWalletFile>
  if (
    wallet.version !== 1
    || wallet.key_store !== 'macos-keychain'
    || typeof wallet.address !== 'string'
    || !wallet.encrypted_private_key
  ) {
    throw new Error(`Invalid encrypted local wallet at ${path}`)
  }
  return wallet as LocalWalletFile
}

export async function getOrCreateLocalWallet(
  contributorId: string,
  options: LocalWalletOptions = {},
): Promise<LocalWalletResult> {
  if (!contributorId) throw new Error('Contributor identity is required before creating a wallet')
  const walletPath = options.walletPath ?? LOCAL_WALLET_PATH
  const keychain = options.keychain ?? macOSKeychain
  const generate = options.generatePrivateKey ?? generatePrivateKey
  const existing = existsSync(walletPath)

  let privateKey: `0x${string}`
  let address: `0x${string}`
  if (existing) {
    const wallet = parseWalletFile(walletPath)
    const encodedWrappingKey = keychain.get(contributorId)
    if (!encodedWrappingKey) {
      throw new Error('Encrypted local wallet exists, but its macOS Keychain wrapping key is missing')
    }
    privateKey = decryptPrivateKey(
      wallet.encrypted_private_key,
      Buffer.from(encodedWrappingKey, 'base64'),
    )
    address = privateKeyToAccount(privateKey).address
    if (address.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error('Encrypted local wallet does not match its recorded address')
    }
  } else {
    privateKey = generate()
    address = privateKeyToAccount(privateKey).address
    const wrappingKey = randomBytes(32)
    const wallet: LocalWalletFile = {
      version: 1,
      address,
      key_store: 'macos-keychain',
      encrypted_private_key: encryptPrivateKey(privateKey, wrappingKey),
    }
    keychain.set(contributorId, wrappingKey.toString('base64'))
    mkdirSync(dirname(walletPath), { recursive: true, mode: 0o700 })
    writeFileSync(walletPath, `${JSON.stringify(wallet, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    chmodSync(walletPath, 0o600)
  }

  const signature = await privateKeyToAccount(privateKey).signMessage({
    message: registrationMessage(contributorId),
  })
  return { address, signature, created: !existing, walletPath }
}
