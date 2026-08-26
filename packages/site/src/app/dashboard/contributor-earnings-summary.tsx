import type { ContributorEarnings } from '@/lib/contributor-earnings'
import styles from './dashboard.module.css'

function displayAmount(value: string | null, maximumFractionDigits: number): string {
  if (value === null) return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(numeric)
}

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

export function ContributorEarningsSummary({ earnings }: { earnings: ContributorEarnings }) {
  const claimLabel = earnings.claimStatus === 'claimable'
    ? 'Ready to claim'
    : earnings.claimStatus === 'nothing_to_claim'
      ? 'Nothing to claim yet'
      : earnings.status === 'wallet_unconfigured'
        ? 'Wallet required'
        : 'Claim status unavailable'
  const claimTone = earnings.claimStatus === 'claimable'
    ? styles.earningsClaimable
    : styles.earningsClaimMuted
  const activeLabel = earnings.activeRevenue.cutoverStatus === 'planned'
    ? 'Planned, not live'
    : earnings.activeRevenue.dataStatus === 'unavailable'
      ? 'Claim data unavailable'
      : earnings.activeRevenue.claimCount > 0
        ? `${earnings.activeRevenue.claimCount} claim${earnings.activeRevenue.claimCount === 1 ? '' : 's'}`
        : 'No active claims yet'

  return (
    <section className={`${styles.panel} ${styles.earningsPanel}`} aria-labelledby="contributor-earnings-title">
      <header className={styles.earningsHeader}>
        <div>
          <span>READ-ONLY · BASE</span>
          <h2 id="contributor-earnings-title">Contributor earnings</h2>
        </div>
        <small>No wallet actions are performed here.</small>
      </header>
      <div className={styles.earningsGrid}>
        <div>
          <small>Configured wallet</small>
          {earnings.walletAddress
            ? <code title={earnings.walletAddress}>{shortAddress(earnings.walletAddress)}</code>
            : <strong>Not configured</strong>}
        </div>
        <div>
          <small>POLLEN balance</small>
          <strong>{earnings.status === 'unavailable' ? 'Unavailable' : displayAmount(earnings.pollenBalance, 4)}</strong>
        </div>
        <div>
          <small>Legacy V2 pending USDC</small>
          <strong>{earnings.status === 'unavailable' ? 'Unavailable' : `$${displayAmount(earnings.pendingUsdc, 6)}`}</strong>
        </div>
        <div>
          <small>Claim status</small>
          <strong className={claimTone}>{claimLabel}</strong>
        </div>
        <div>
          <small>Active-holder claims</small>
          <strong>{earnings.activeRevenue.dataStatus === 'unavailable'
            ? 'Unavailable'
            : `$${displayAmount(earnings.activeRevenue.totalClaimableUsdc, 6)}`}</strong>
        </div>
        <div>
          <small>V3 revenue path</small>
          <strong className={styles.earningsClaimMuted}>{activeLabel}</strong>
        </div>
      </div>
      <p className={styles.earningsNote}>
        {earnings.status === 'wallet_unconfigured'
          ? 'Configure a payout wallet with the Pollen CLI to view public on-chain earnings.'
          : earnings.status === 'unavailable'
            ? 'The wallet is configured, but Base RPC data could not be read. No cached balance is shown.'
            : earnings.claimStatus === 'claimable'
              ? 'Legacy USDC remains in PollenTokenV2 until you explicitly claim it outside this dashboard.'
              : 'No legacy V2 USDC revenue is currently claimable for this wallet.'}
      </p>
      <p className={styles.earningsNote}>
        The active-holder V3 path uses weekly Merkle claims. It remains non-live until the vault,
        settlement cutover, and first distribution receive separate production approval.
      </p>
    </section>
  )
}
