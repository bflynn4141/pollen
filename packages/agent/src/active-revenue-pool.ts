export interface ActiveRevenueDepositEvent {
  blockNumber: bigint
  transactionHash: string
  logIndex: number
  amountAtomicUsdc: bigint
}

export interface ActiveRevenuePoolInput {
  startBlock: bigint
  endBlock: bigint
  carryInAtomicUsdc: bigint
  deposits: ActiveRevenueDepositEvent[]
}

export interface ActiveRevenuePoolReconciliation {
  startBlock: bigint
  endBlock: bigint
  carryInAtomicUsdc: bigint
  settledAtomicUsdc: bigint
  distributableAtomicUsdc: bigint
  depositCount: number
  eventKeys: string[]
}

/**
 * Reconcile one closed epoch's V3 RevenueDeposited events plus documented
 * carry. Event fetching is intentionally separate so two reviewers can use
 * independent Base RPC/indexer sources and compare this exact result.
 */
export function reconcileActiveRevenuePool(
  input: ActiveRevenuePoolInput,
): ActiveRevenuePoolReconciliation {
  if (input.startBlock <= BigInt(0) || input.endBlock < input.startBlock) {
    throw new Error('invalid epoch block window')
  }
  if (input.carryInAtomicUsdc < BigInt(0)) throw new Error('carry cannot be negative')

  const seen = new Set<string>()
  let settledAtomicUsdc = BigInt(0)
  for (const event of input.deposits) {
    if (event.blockNumber < input.startBlock || event.blockNumber > input.endBlock) {
      throw new Error(`deposit event outside epoch block window: ${event.blockNumber}`)
    }
    if (!event.transactionHash || !Number.isInteger(event.logIndex) || event.logIndex < 0) {
      throw new Error('invalid deposit event identity')
    }
    if (event.amountAtomicUsdc <= BigInt(0)) throw new Error('deposit amount must be positive')
    const key = `${event.transactionHash.toLowerCase()}:${event.logIndex}`
    if (seen.has(key)) throw new Error(`duplicate deposit event: ${key}`)
    seen.add(key)
    settledAtomicUsdc += event.amountAtomicUsdc
  }

  return {
    startBlock: input.startBlock,
    endBlock: input.endBlock,
    carryInAtomicUsdc: input.carryInAtomicUsdc,
    settledAtomicUsdc,
    distributableAtomicUsdc: settledAtomicUsdc + input.carryInAtomicUsdc,
    depositCount: input.deposits.length,
    eventKeys: [...seen].sort(),
  }
}
