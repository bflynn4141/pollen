export type WalletBindingResult = 'bound' | 'not_found' | 'wallet_mismatch'

export type WalletBindingSql = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Record<string, unknown>[]>

/**
 * Bind the first payout wallet atomically, or refresh the signature for the
 * same wallet. A different address can never replace a previously registered
 * wallet: the conditional UPDATE is the first-write-wins boundary.
 */
export async function claimWalletBinding(
  sql: WalletBindingSql,
  contributorId: string,
  walletAddress: string,
  signature: string,
): Promise<WalletBindingResult> {
  const updated = await sql`
    UPDATE contributors
    SET
      wallet_address = COALESCE(wallet_address, ${walletAddress}),
      wallet_binding_sig = ${signature},
      updated_at = NOW()
    WHERE contributor_id = ${contributorId}
      AND (
        wallet_address IS NULL
        OR LOWER(wallet_address) = LOWER(${walletAddress})
      )
    RETURNING wallet_address
  `
  if (updated.length > 0) return 'bound'

  const existing = await sql`
    SELECT wallet_address
    FROM contributors
    WHERE contributor_id = ${contributorId}
  `
  return existing.length === 0 ? 'not_found' : 'wallet_mismatch'
}
