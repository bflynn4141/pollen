/**
 * `pollen claim` — claim POLLEN tokens or USDC revenue.
 *
 * Token claim flow:
 *   1. Load wallet address from config
 *   2. Find latest published epoch from Neon
 *   3. Fetch Merkle proof for this wallet
 *   4. Submit claim tx to PollenDistributor on-chain
 *
 * Revenue claim:
 *   1. Call claimRevenue() on PollenToken
 */
import {
  createPublicClient, createWalletClient, http,
  type Address, type Hex,
  parseAbi, formatUnits,
} from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { loadConfig, getWalletAddress, PROXY_URL, type ParaWallet } from './config.js'
import { getMerkleProof } from './epoch.js'
import { listEpochs } from './credits.js'

// --- Contract ABIs (minimal) ---

const DISTRIBUTOR_ABI = parseAbi([
  'function claim(uint256 cumulativeAmount, bytes32[] calldata proof) external',
  'function claimable(address account, uint256 cumulativeAmount) external view returns (uint256)',
  'function cumulativeClaimed(address) external view returns (uint256)',
  'function currentEpoch() external view returns (uint256)',
  'function merkleRoot() external view returns (bytes32)',
])

const TOKEN_ABI = parseAbi([
  'function claimRevenue() external',
  'function earned(address account) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function holdingSince(address account) external view returns (uint256)',
  'function minHoldBlocks() external view returns (uint256)',
])

export interface ClaimConfig {
  distributorAddress: Address
  tokenAddress: Address
  rpcUrl: string
}

/**
 * Claim POLLEN tokens for all completed epochs.
 */
export async function claimTokens(
  connectionString: string,
  claimConfig: ClaimConfig,
  privateKey: Hex,
): Promise<{ txHash: Hex; amount: bigint } | { error: string }> {
  const config = loadConfig()
  const addr = getWalletAddress()
  if (!addr) return { error: 'No wallet configured. Run: pollen wallet' }
  if (!config?.world_id) return { error: 'World ID not verified. Run: pollen verify' }

  const walletAddress = addr as Address

  // Find latest published epoch
  const epochs = await listEpochs(connectionString)
  const published = epochs.find(e => e.status === 'published')
  if (!published) return { error: 'No published epochs yet. Tokens will be claimable after the first epoch closes.' }

  // Get Merkle proof
  const proofData = await getMerkleProof(connectionString, published.epoch_id, walletAddress)
  if (!proofData) return { error: 'No claimable tokens found for your wallet address.' }

  const cumulativeAmount = BigInt(proofData.cumulativeAmount)

  // Check on-chain if there's anything to claim
  const publicClient = createPublicClient({
    chain: base,
    transport: http(claimConfig.rpcUrl),
  })

  const alreadyClaimed = await publicClient.readContract({
    address: claimConfig.distributorAddress,
    abi: DISTRIBUTOR_ABI,
    functionName: 'cumulativeClaimed',
    args: [walletAddress],
  })

  if (cumulativeAmount <= alreadyClaimed) {
    return { error: 'All tokens already claimed. Earn more credits in the next epoch!' }
  }

  const claimable = cumulativeAmount - alreadyClaimed

  // Submit claim tx
  const account = privateKeyToAccount(privateKey)
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(claimConfig.rpcUrl),
  })

  const txHash = await walletClient.writeContract({
    address: claimConfig.distributorAddress,
    abi: DISTRIBUTOR_ABI,
    functionName: 'claim',
    args: [cumulativeAmount, proofData.proof as Hex[]],
  })

  return { txHash, amount: claimable }
}

/**
 * Claim USDC revenue from POLLEN holdings.
 */
export async function claimRevenue(
  claimConfig: ClaimConfig,
  privateKey: Hex,
): Promise<{ txHash: Hex; amount: bigint } | { error: string }> {
  const addr = getWalletAddress()
  if (!addr) return { error: 'No wallet configured. Run: pollen wallet' }

  const walletAddress = addr as Address

  const publicClient = createPublicClient({
    chain: base,
    transport: http(claimConfig.rpcUrl),
  })

  // Check pending revenue
  const pending = await publicClient.readContract({
    address: claimConfig.tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'earned',
    args: [walletAddress],
  })

  if (pending === 0n) {
    return { error: 'No pending revenue to claim.' }
  }

  // Check holding period
  const holdingSince = await publicClient.readContract({
    address: claimConfig.tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'holdingSince',
    args: [walletAddress],
  })

  const minHoldBlocks = await publicClient.readContract({
    address: claimConfig.tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'minHoldBlocks',
  })

  const currentBlock = await publicClient.getBlockNumber()
  if (currentBlock < holdingSince + minHoldBlocks) {
    const blocksRemaining = holdingSince + minHoldBlocks - currentBlock
    return { error: `Holding period not met. ${blocksRemaining} blocks remaining (~${Math.ceil(Number(blocksRemaining) * 2 / 60)} min).` }
  }

  // Submit claim
  const account = privateKeyToAccount(privateKey)
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(claimConfig.rpcUrl),
  })

  const txHash = await walletClient.writeContract({
    address: claimConfig.tokenAddress,
    abi: TOKEN_ABI,
    functionName: 'claimRevenue',
  })

  return { txHash, amount: pending }
}

/**
 * Preview claim status (read-only, no tx).
 */
export async function previewClaim(
  connectionString: string,
  claimConfig: ClaimConfig,
): Promise<string> {
  const addr = getWalletAddress()
  if (!addr) return 'No wallet configured. Run: pollen wallet'

  const walletAddress = addr as Address
  const lines: string[] = []

  const publicClient = createPublicClient({
    chain: base,
    transport: http(claimConfig.rpcUrl),
  })

  // Token balance
  try {
    const balance = await publicClient.readContract({
      address: claimConfig.tokenAddress,
      abi: TOKEN_ABI,
      functionName: 'balanceOf',
      args: [walletAddress],
    })
    lines.push(`  POLLEN balance: ${formatUnits(balance, 18)}`)
  } catch {
    lines.push('  POLLEN balance: (contract not deployed yet)')
  }

  // Pending revenue
  try {
    const earned = await publicClient.readContract({
      address: claimConfig.tokenAddress,
      abi: TOKEN_ABI,
      functionName: 'earned',
      args: [walletAddress],
    })
    lines.push(`  Pending USDC:   ${formatUnits(earned, 6)}`)
  } catch {
    lines.push('  Pending USDC:   (contract not deployed yet)')
  }

  // Unclaimed tokens from latest epoch
  const epochs = await listEpochs(connectionString)
  const published = epochs.find(e => e.status === 'published')
  if (published) {
    const proofData = await getMerkleProof(connectionString, published.epoch_id, walletAddress)
    if (proofData) {
      try {
        const alreadyClaimed = await publicClient.readContract({
          address: claimConfig.distributorAddress,
          abi: DISTRIBUTOR_ABI,
          functionName: 'cumulativeClaimed',
          args: [walletAddress],
        })
        const cumulative = BigInt(proofData.cumulativeAmount)
        const claimable = cumulative > alreadyClaimed ? cumulative - alreadyClaimed : 0n
        lines.push(`  Unclaimed POLLEN: ${formatUnits(claimable, 18)} (epoch ${published.epoch_id})`)
      } catch {
        lines.push(`  Unclaimed POLLEN: (contract not deployed yet)`)
      }
    }
  }

  return lines.length > 0 ? lines.join('\n') : '  No on-chain data available yet.'
}

// ============================================
// Para Wallet Claim (via proxy — no private key needed)
// ============================================

/**
 * Claim POLLEN tokens via Clara proxy (Para wallet path).
 */
export async function claimViaProxy(
  connectionString: string,
  paraWallet: ParaWallet,
  apiKey: string,
): Promise<{ txHash: string; amount: bigint } | { error: string }> {
  const config = loadConfig()
  if (!config?.world_id) return { error: 'World ID not verified. Run: pollen verify' }

  const walletAddress = paraWallet.address as Address

  // Find latest published epoch
  const epochs = await listEpochs(connectionString)
  const published = epochs.find(e => e.status === 'published')
  if (!published) return { error: 'No published epochs yet. Tokens will be claimable after the first epoch closes.' }

  // Get Merkle proof
  const proofData = await getMerkleProof(connectionString, published.epoch_id, walletAddress)
  if (!proofData) return { error: 'No claimable tokens found for your wallet address.' }

  const distributorAddress = process.env.POLLEN_DISTRIBUTOR_ADDRESS
  if (!distributorAddress) return { error: 'POLLEN_DISTRIBUTOR_ADDRESS not set.' }

  const res = await fetch(`${PROXY_URL}/pollen/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Pollen-Key': apiKey,
    },
    body: JSON.stringify({
      walletId: paraWallet.wallet_id,
      address: paraWallet.address,
      distributorAddress,
      cumulativeAmount: proofData.cumulativeAmount,
      proof: proofData.proof,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { error: `Claim failed: ${text}` }
  }

  const { txHash } = await res.json() as { txHash: string }
  return { txHash, amount: BigInt(proofData.cumulativeAmount) }
}

/**
 * Claim USDC revenue via Clara proxy (Para wallet path).
 */
export async function claimRevenueViaProxy(
  paraWallet: ParaWallet,
  apiKey: string,
): Promise<{ txHash: string } | { error: string }> {
  const tokenAddress = process.env.POLLEN_TOKEN_ADDRESS
  if (!tokenAddress) return { error: 'POLLEN_TOKEN_ADDRESS not set.' }

  const res = await fetch(`${PROXY_URL}/pollen/claim-revenue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Pollen-Key': apiKey,
    },
    body: JSON.stringify({
      walletId: paraWallet.wallet_id,
      address: paraWallet.address,
      tokenAddress,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { error: `Revenue claim failed: ${text}` }
  }

  const { txHash } = await res.json() as { txHash: string }
  return { txHash }
}
