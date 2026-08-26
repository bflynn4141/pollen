import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  keccak256,
  zeroHash,
  type Address,
  type Hex,
} from 'viem'

export interface ActiveRevenueMerkleInput {
  contributorId: string
  walletAddress: string
  amountAtomicUsdc: bigint
}

export interface ActiveRevenueMerkleLeaf {
  contributorId: string
  epoch: number
  index: number
  walletAddress: Address
  amountAtomicUsdc: bigint
  hash: Hex
  proof: Hex[]
}

export interface ActiveRevenueMerkleTree {
  root: Hex
  leaves: ActiveRevenueMerkleLeaf[]
}

/** Matches the double-hashed OpenZeppelin StandardMerkleTree leaf convention. */
export function hashActiveRevenueLeaf(
  epoch: number,
  index: number,
  walletAddress: string,
  amountAtomicUsdc: bigint,
): Hex {
  const encoded = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'uint256' },
    ],
    [BigInt(epoch), BigInt(index), getAddress(walletAddress), amountAtomicUsdc],
  )
  return keccak256(keccak256(encoded))
}

function hashPair(a: Hex, b: Hex): Hex {
  return keccak256(a.toLowerCase() < b.toLowerCase() ? concatHex([a, b]) : concatHex([b, a]))
}

function buildLevels(hashes: Hex[]): Hex[][] {
  const levels: Hex[][] = [hashes]
  while (levels[levels.length - 1].length > 1) {
    const prior = levels[levels.length - 1]
    const next: Hex[] = []
    for (let i = 0; i < prior.length; i += 2) {
      next.push(i + 1 < prior.length ? hashPair(prior[i], prior[i + 1]) : prior[i])
    }
    levels.push(next)
  }
  return levels
}

function proofFor(levels: Hex[][], leafIndex: number): Hex[] {
  const proof: Hex[] = []
  let index = leafIndex
  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex++) {
    const level = levels[levelIndex]
    const sibling = index % 2 === 0 ? index + 1 : index - 1
    if (sibling < level.length) proof.push(level[sibling])
    index = Math.floor(index / 2)
  }
  return proof
}

export function buildActiveRevenueMerkleTree(
  epoch: number,
  rows: ActiveRevenueMerkleInput[],
): ActiveRevenueMerkleTree {
  if (rows.length === 0) return { root: zeroHash, leaves: [] }
  const sorted = rows
    .map(row => ({ ...row, walletAddress: getAddress(row.walletAddress) }))
    .sort((a, b) => a.walletAddress.toLowerCase().localeCompare(b.walletAddress.toLowerCase()))
  const seen = new Set<string>()
  for (const row of sorted) {
    if (row.amountAtomicUsdc <= 0n) throw new Error('Merkle allocation must be positive')
    const key = row.walletAddress.toLowerCase()
    if (seen.has(key)) throw new Error(`duplicate Merkle wallet: ${row.walletAddress}`)
    seen.add(key)
  }

  const hashes = sorted.map((row, index) =>
    hashActiveRevenueLeaf(epoch, index, row.walletAddress, row.amountAtomicUsdc),
  )
  const levels = buildLevels(hashes)
  return {
    root: levels[levels.length - 1][0],
    leaves: sorted.map((row, index) => ({
      ...row,
      epoch,
      index,
      hash: hashes[index],
      proof: proofFor(levels, index),
    })),
  }
}

export function verifyActiveRevenueProof(
  root: Hex,
  leaf: Pick<ActiveRevenueMerkleLeaf, 'epoch' | 'index' | 'walletAddress' | 'amountAtomicUsdc'>,
  proof: Hex[],
): boolean {
  let computed = hashActiveRevenueLeaf(
    leaf.epoch,
    leaf.index,
    leaf.walletAddress,
    leaf.amountAtomicUsdc,
  )
  for (const sibling of proof) computed = hashPair(computed, sibling)
  return computed.toLowerCase() === root.toLowerCase()
}
