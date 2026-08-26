import { getAddress, isAddress, parseAbi, type Address } from 'viem'
import { epochBounds } from './epoch.js'

const MAX_SNAPSHOT_LAG_SECONDS = 15 * 60
const TOKEN_ABI = parseAbi([
  'function balanceOf(address account) external view returns (uint256)',
])

export interface PollenSnapshotClient {
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }>
  readContract(args: {
    address: Address
    abi: typeof TOKEN_ABI
    functionName: 'balanceOf'
    args: readonly [Address]
    blockNumber: bigint
  }): Promise<unknown>
}

export interface PollenSnapshotRequest {
  distributionEpoch: number
  tokenAddress: string
  blockNumber: bigint
  walletAddresses: string[]
}

export interface PollenBalanceSnapshot {
  distributionEpoch: number
  tokenAddress: Address
  blockNumber: bigint
  blockTimestamp: number
  balances: Array<{ walletAddress: Address; balanceWei: bigint }>
}

/**
 * Read POLLEN balances at one explicit historical boundary block. The RPC must
 * retain archive state; falling back to latest balances is intentionally not
 * permitted because that would let post-boundary transfers affect rewards.
 */
export async function readPollenSnapshot(
  client: PollenSnapshotClient,
  request: PollenSnapshotRequest,
): Promise<PollenBalanceSnapshot> {
  if (!Number.isInteger(request.distributionEpoch) || request.distributionEpoch < 1) {
    throw new Error('distribution epoch must be a 1-based integer')
  }
  if (!isAddress(request.tokenAddress)) throw new Error('invalid POLLEN token address')
  if (request.blockNumber <= 0n) throw new Error('snapshot block is required')

  const tokenAddress = getAddress(request.tokenAddress)
  const seen = new Set<string>()
  const wallets = request.walletAddresses.map(value => {
    if (!isAddress(value)) throw new Error(`invalid snapshot wallet: ${value}`)
    const walletAddress = getAddress(value)
    const key = walletAddress.toLowerCase()
    if (seen.has(key)) throw new Error(`duplicate snapshot wallet: ${walletAddress}`)
    seen.add(key)
    return walletAddress
  }).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))

  const [block, successor] = await Promise.all([
    client.getBlock({ blockNumber: request.blockNumber }),
    client.getBlock({ blockNumber: request.blockNumber + BigInt(1) }),
  ])
  const blockTimestamp = Number(block.timestamp)
  const successorTimestamp = Number(successor.timestamp)
  const boundary = Math.floor(epochBounds(request.distributionEpoch).endsAt / 1000)
  if (
    !Number.isSafeInteger(blockTimestamp)
    || blockTimestamp > boundary
    || blockTimestamp < boundary - MAX_SNAPSHOT_LAG_SECONDS
  ) {
    throw new Error(`snapshot must be the last block at or before epoch boundary ${boundary}`)
  }
  if (!Number.isSafeInteger(successorTimestamp) || successorTimestamp <= boundary) {
    throw new Error(`snapshot successor block must be after epoch boundary ${boundary}`)
  }

  const balances = await Promise.all(wallets.map(async walletAddress => {
    const value = await client.readContract({
      address: tokenAddress,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [walletAddress],
      blockNumber: request.blockNumber,
    })
    if (typeof value !== 'bigint') throw new Error(`invalid balance result for ${walletAddress}`)
    return { walletAddress, balanceWei: value }
  }))

  return {
    distributionEpoch: request.distributionEpoch,
    tokenAddress,
    blockNumber: request.blockNumber,
    blockTimestamp,
    balances,
  }
}
