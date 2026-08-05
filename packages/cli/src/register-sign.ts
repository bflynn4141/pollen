/**
 * BYO-wallet binding signature.
 *
 * When a contributor brings their own wallet and has POLLEN_PRIVATE_KEY set,
 * we cryptographically bind wallet -> contributor_id by signing the message
 * `pollen:register:<contributor_id>` (EIP-191 personal_sign via viem). The
 * signature is stored in local config as `wallet_binding_sig` so `pollen sync`
 * uploads it, letting the payout pipeline verify the registered address
 * actually belongs to this contributor.
 *
 * Para-managed wallets can't sign locally (keys live server-side), so they
 * skip this silently — World ID remains the actual payout gate (accepted
 * MVP risk, documented in the plan).
 */
import { privateKeyToAccount } from 'viem/accounts'
import { loadConfig, saveConfig, getOrCreateContributorId } from './config.js'

/** The exact message a BYO wallet signs to bind itself to a contributor. */
export function registrationMessage(contributorId: string): string {
  return `pollen:register:${contributorId}`
}

/**
 * If POLLEN_PRIVATE_KEY is present, sign the registration message and persist
 * the signature to local config. Returns the signature, or null when skipped.
 *
 * - No key in env: skip silently (Para / address-only path).
 * - Key derives a different address than the one being registered: warn + skip
 *   (a mismatched signature would never validate server-side).
 */
export async function maybeSignWalletBinding(expectedAddress?: string): Promise<string | null> {
  const pk = process.env.POLLEN_PRIVATE_KEY
  if (!pk) return null

  try {
    const normalized = (pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`
    const account = privateKeyToAccount(normalized)

    if (expectedAddress && account.address.toLowerCase() !== expectedAddress.toLowerCase()) {
      console.warn(
        `  Warning: POLLEN_PRIVATE_KEY derives ${account.address}, not the registered address ${expectedAddress}. Skipping binding signature.`,
      )
      return null
    }

    const contributorId = getOrCreateContributorId()
    const signature = await account.signMessage({ message: registrationMessage(contributorId) })

    const config = loadConfig() ?? { contributor_id: contributorId }
    config.wallet_binding_sig = signature
    saveConfig(config)
    return signature
  } catch (err) {
    console.warn(`  Warning: could not sign wallet binding: ${(err as Error).message}`)
    return null
  }
}
