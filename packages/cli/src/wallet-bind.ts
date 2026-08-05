import { getAddress, verifyMessage, type Hex } from 'viem'
import { getWalletAddress, loadConfig, saveConfig } from './config.js'
import { registrationMessage } from './register-sign.js'

const IDENTITY_API_URL = process.env.POLLEN_IDENTITY_API_URL
  ?? process.env.POLLEN_API_URL
  ?? 'https://site-alpha-umber-69.vercel.app'

export interface WalletBindingPayload {
  contributor_id: string
  wallet_address: string
  signature: Hex
}

export async function isValidWalletBinding(payload: WalletBindingPayload): Promise<boolean> {
  try {
    return await verifyMessage({
      address: getAddress(payload.wallet_address),
      message: registrationMessage(payload.contributor_id),
      signature: payload.signature,
    })
  } catch {
    return false
  }
}

export async function submitWalletBinding(
  payload: WalletBindingPayload,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!await isValidWalletBinding(payload)) {
    throw new Error('Signature does not recover to the registered wallet address')
  }

  const response = await fetchImpl(`${IDENTITY_API_URL}/api/v1/wallet/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  let data: { success?: boolean; code?: string; detail?: string } = {}
  try {
    data = await response.json() as typeof data
  } catch {
    // handled below
  }
  if (!response.ok || data.success !== true) {
    throw new Error([data.code ?? `http_${response.status}`, data.detail].filter(Boolean).join(' — '))
  }
}

export async function runWalletBind(argv: string[] = process.argv): Promise<void> {
  const config = loadConfig()
  const contributorId = config?.contributor_id
  const walletAddress = getWalletAddress()
  if (!contributorId || !walletAddress) {
    throw new Error('Contributor or wallet is not configured; run `pollen verify` and `pollen wallet` first')
  }

  const signatureIndex = argv.indexOf('--signature')
  const signature = signatureIndex >= 0 ? argv[signatureIndex + 1] : undefined
  const message = registrationMessage(contributorId)
  if (!signature) {
    console.log('Wallet binding message (EIP-191):')
    console.log(`  ${message}`)
    console.log('')
    console.log(`Expected signer: ${walletAddress}`)
    console.log('Sign this exact message with Clara, then run:')
    console.log('  pollen wallet bind --signature 0x...')
    return
  }
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error('Invalid EVM signature; expected 65-byte 0x-prefixed hex')
  }

  const payload: WalletBindingPayload = {
    contributor_id: contributorId,
    wallet_address: walletAddress,
    signature: signature as Hex,
  }
  await submitWalletBinding(payload)

  const updated = loadConfig() ?? { contributor_id: contributorId }
  updated.wallet_binding_sig = signature
  saveConfig(updated)
  console.log(`✓ Wallet binding verified: ${walletAddress}`)
  console.log(`  Contributor: ${contributorId}`)
}
