import { getAddress, isAddress, type Address } from 'viem'
import { epochBounds } from './epoch.js'
import { scaleDecimal } from './prorata.js'

export const ACTIVE_REVENUE_FORMULA_VERSION = 'active-holder-v1'
export const ACTIVE_LOOKBACK_EPOCHS = 4
export const ACTIVE_RECENCY_NUMERATORS = [8n, 4n, 2n, 1n] as const
export const ACTIVE_RECENCY_DENOMINATOR = 8n
export const ACTIVE_WALLET_CAP_BPS = 1_000n
const BPS_DENOMINATOR = 10_000n
const MAX_SNAPSHOT_LAG_SECONDS = 15 * 60

export interface EpochScore {
  epoch: number
  score: string
}

export interface ActiveHolderCandidate {
  contributorId: string
  worldIdNullifier: string | null
  walletAddress: string | null
  walletBindingValid: boolean
  snapshotBalanceWei: bigint
  scores: EpochScore[]
}

export interface ActiveHolderSnapshot {
  tokenAddress: string
  blockNumber: bigint
  /** Timestamp of the last block at or before the UTC epoch boundary. */
  blockTimestamp: number
}

export interface ActiveHolderAllocationInput {
  distributionEpoch: number
  currentEpoch: number
  poolAtomicUsdc: bigint
  snapshot: ActiveHolderSnapshot
  candidates: ActiveHolderCandidate[]
}

export type ActiveHolderRejectionReason =
  | 'identity_required'
  | 'wallet_required'
  | 'wallet_binding_invalid'
  | 'no_snapshot_pollen'
  | 'no_recent_positive_score'

export interface EligibleActiveHolder {
  contributorId: string
  worldIdNullifier: string
  walletAddress: Address
  snapshotBalanceWei: bigint
  balanceSqrt: bigint
  decayedActivity: bigint
  rawWeight: bigint
}

export interface ActiveHolderAllocation extends EligibleActiveHolder {
  amountAtomicUsdc: bigint
}

export interface ActiveHolderAllocationResult {
  formulaVersion: typeof ACTIVE_REVENUE_FORMULA_VERSION
  distributionEpoch: number
  snapshot: ActiveHolderSnapshot & { tokenAddress: Address }
  poolAtomicUsdc: bigint
  capAtomicUsdc: bigint
  eligible: EligibleActiveHolder[]
  rejected: Array<{ contributorId: string; reason: ActiveHolderRejectionReason }>
  allocations: ActiveHolderAllocation[]
  totalAllocatedAtomicUsdc: bigint
  carryAtomicUsdc: bigint
}

export function integerSqrt(value: bigint): bigint {
  if (value < 0n) throw new Error('square root requires a non-negative integer')
  if (value < 2n) return value
  let x = value
  let y = (x + 1n) / 2n
  while (y < x) {
    x = y
    y = (x + value / x) / 2n
  }
  return x
}

/**
 * Returns score microunits multiplied by the common recency denominator (8).
 * The common denominator is intentionally retained because it cancels during
 * proportional allocation and avoids fractional arithmetic.
 */
export function computeDecayedActivity(scores: EpochScore[], distributionEpoch: number): bigint {
  const byEpoch = new Map<number, bigint>()
  for (const row of scores) {
    if (!Number.isInteger(row.epoch) || row.epoch < 1) {
      throw new Error(`invalid score epoch: ${row.epoch}`)
    }
    if (byEpoch.has(row.epoch)) {
      throw new Error(`duplicate score epoch ${row.epoch}`)
    }
    byEpoch.set(row.epoch, scaleDecimal(row.score))
  }

  let weighted = 0n
  for (let offset = 0; offset < ACTIVE_LOOKBACK_EPOCHS; offset++) {
    weighted += (byEpoch.get(distributionEpoch - offset) ?? 0n)
      * ACTIVE_RECENCY_NUMERATORS[offset]
  }
  return weighted
}

function validateInput(input: ActiveHolderAllocationInput): Address {
  if (!Number.isInteger(input.distributionEpoch) || input.distributionEpoch < 1) {
    throw new Error('distribution epoch must be a 1-based integer')
  }
  if (input.currentEpoch !== input.distributionEpoch + 1) {
    throw new Error('active revenue can be allocated only for the just-closed epoch')
  }
  if (input.poolAtomicUsdc < 0n) throw new Error('pool cannot be negative')
  if (!isAddress(input.snapshot.tokenAddress)) throw new Error('invalid snapshot token address')
  if (input.snapshot.blockNumber <= 0n) throw new Error('snapshot block is required')
  if (!Number.isInteger(input.snapshot.blockTimestamp)) {
    throw new Error('snapshot timestamp must be integer seconds')
  }
  const boundary = Math.floor(epochBounds(input.distributionEpoch).endsAt / 1000)
  if (
    input.snapshot.blockTimestamp > boundary
    || input.snapshot.blockTimestamp < boundary - MAX_SNAPSHOT_LAG_SECONDS
  ) {
    throw new Error(
      `snapshot timestamp must be the last block at or before epoch boundary ${boundary}`,
    )
  }
  return getAddress(input.snapshot.tokenAddress)
}

function validateUniqueness(candidates: ActiveHolderCandidate[]): Map<string, Address> {
  const contributors = new Set<string>()
  const identities = new Set<string>()
  const wallets = new Set<string>()
  const normalized = new Map<string, Address>()

  for (const row of candidates) {
    if (contributors.has(row.contributorId)) {
      throw new Error(`duplicate contributor ID: ${row.contributorId}`)
    }
    contributors.add(row.contributorId)

    if (row.worldIdNullifier) {
      const identityKey = row.worldIdNullifier.toLowerCase()
      if (identities.has(identityKey)) {
        throw new Error(`duplicate World ID: ${row.worldIdNullifier}`)
      }
      identities.add(identityKey)
    }

    if (row.walletAddress === null || row.walletAddress === '') continue
    if (!isAddress(row.walletAddress)) {
      throw new Error(`invalid wallet for ${row.contributorId}`)
    }
    const address = getAddress(row.walletAddress)
    const walletKey = address.toLowerCase()
    if (wallets.has(walletKey)) throw new Error(`duplicate wallet: ${address}`)
    wallets.add(walletKey)
    normalized.set(row.contributorId, address)
  }
  return normalized
}

interface WeightedRow {
  row: EligibleActiveHolder
  amount: bigint
  remainder: bigint
}

function allocateCapped(
  eligible: EligibleActiveHolder[],
  pool: bigint,
  cap: bigint,
): Map<string, bigint> {
  const amounts = new Map(eligible.map(row => [row.contributorId, 0n]))
  if (eligible.length === 0 || pool === 0n || cap === 0n) return amounts

  const target = pool < cap * BigInt(eligible.length)
    ? pool
    : cap * BigInt(eligible.length)
  let remainingPool = target
  let remaining = eligible.map(row => ({ row, amount: 0n, remainder: 0n }))

  for (;;) {
    const totalWeight = remaining.reduce((sum, item) => sum + item.row.rawWeight, 0n)
    if (remaining.length === 0 || remainingPool === 0n || totalWeight === 0n) break
    const saturated = remaining.filter(item =>
      remainingPool * item.row.rawWeight >= cap * totalWeight,
    )
    if (saturated.length === 0) {
      const floors: WeightedRow[] = remaining.map(item => ({
        ...item,
        amount: (remainingPool * item.row.rawWeight) / totalWeight,
        remainder: (remainingPool * item.row.rawWeight) % totalWeight,
      }))
      const floorTotal = floors.reduce((sum, item) => sum + item.amount, 0n)
      let dust = remainingPool - floorTotal
      floors.sort((a, b) => {
        if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1
        return a.row.walletAddress.toLowerCase().localeCompare(b.row.walletAddress.toLowerCase())
      })
      for (const item of floors) {
        if (dust === 0n) break
        if (item.amount < cap) {
          item.amount += 1n
          dust -= 1n
        }
      }
      for (const item of floors) amounts.set(item.row.contributorId, item.amount)
      remainingPool = 0n
      break
    }

    const saturatedIds = new Set(saturated.map(item => item.row.contributorId))
    for (const item of saturated) {
      amounts.set(item.row.contributorId, cap)
      remainingPool -= cap
    }
    remaining = remaining.filter(item => !saturatedIds.has(item.row.contributorId))
  }

  return amounts
}

export function computeActiveHolderAllocations(
  input: ActiveHolderAllocationInput,
): ActiveHolderAllocationResult {
  const tokenAddress = validateInput(input)
  const normalizedWallets = validateUniqueness(input.candidates)
  const eligible: EligibleActiveHolder[] = []
  const rejected: ActiveHolderAllocationResult['rejected'] = []

  for (const candidate of input.candidates) {
    let reason: ActiveHolderRejectionReason | null = null
    if (!candidate.worldIdNullifier) reason = 'identity_required'
    else if (!candidate.walletAddress) reason = 'wallet_required'
    else if (!candidate.walletBindingValid) reason = 'wallet_binding_invalid'
    else if (candidate.snapshotBalanceWei <= 0n) reason = 'no_snapshot_pollen'

    const decayedActivity = computeDecayedActivity(candidate.scores, input.distributionEpoch)
    if (!reason && decayedActivity === 0n) reason = 'no_recent_positive_score'
    if (reason) {
      rejected.push({ contributorId: candidate.contributorId, reason })
      continue
    }

    const balanceSqrt = integerSqrt(candidate.snapshotBalanceWei)
    eligible.push({
      contributorId: candidate.contributorId,
      worldIdNullifier: candidate.worldIdNullifier!,
      walletAddress: normalizedWallets.get(candidate.contributorId)!,
      snapshotBalanceWei: candidate.snapshotBalanceWei,
      balanceSqrt,
      decayedActivity,
      rawWeight: decayedActivity * balanceSqrt,
    })
  }

  eligible.sort((a, b) =>
    a.walletAddress.toLowerCase().localeCompare(b.walletAddress.toLowerCase()),
  )
  const capAtomicUsdc = (input.poolAtomicUsdc * ACTIVE_WALLET_CAP_BPS) / BPS_DENOMINATOR
  const amounts = allocateCapped(eligible, input.poolAtomicUsdc, capAtomicUsdc)
  const allocations = eligible
    .map(row => ({ ...row, amountAtomicUsdc: amounts.get(row.contributorId) ?? 0n }))
    .filter(row => row.amountAtomicUsdc > 0n)
  const totalAllocatedAtomicUsdc = allocations.reduce(
    (sum, row) => sum + row.amountAtomicUsdc,
    0n,
  )

  return {
    formulaVersion: ACTIVE_REVENUE_FORMULA_VERSION,
    distributionEpoch: input.distributionEpoch,
    snapshot: { ...input.snapshot, tokenAddress },
    poolAtomicUsdc: input.poolAtomicUsdc,
    capAtomicUsdc,
    eligible,
    rejected,
    allocations,
    totalAllocatedAtomicUsdc,
    carryAtomicUsdc: input.poolAtomicUsdc - totalAllocatedAtomicUsdc,
  }
}
