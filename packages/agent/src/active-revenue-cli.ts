export interface ActiveRevenuePlanFlags {
  epoch: number
  poolAtomicUsdc: bigint
  snapshotBlock: bigint
}

function parseInteger(value: string | undefined, name: string, allowZero: boolean): bigint {
  try {
    const parsed = BigInt(value ?? '')
    if (parsed < BigInt(0) || (!allowZero && parsed === BigInt(0))) {
      throw new Error('out of range')
    }
    return parsed
  } catch {
    const expectation = allowZero ? 'a non-negative integer' : 'a positive integer'
    throw new Error(`${name} expects ${expectation}, got: ${value}`)
  }
}

export function parseActiveRevenuePlanFlags(argv: string[]): ActiveRevenuePlanFlags {
  let epoch: number | undefined
  let poolAtomicUsdc: bigint | undefined
  let snapshotBlock: bigint | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[++i]
    if (arg === '--epoch') epoch = Number(value)
    else if (arg === '--pool-atomic') poolAtomicUsdc = parseInteger(value, arg, true)
    else if (arg === '--snapshot-block') snapshotBlock = parseInteger(value, arg, false)
    else throw new Error(`unknown active-revenue-plan flag: ${arg}`)
  }

  if (!Number.isInteger(epoch) || (epoch ?? 0) < 1) {
    throw new Error(`--epoch expects a 1-based integer, got: ${epoch}`)
  }
  if (poolAtomicUsdc === undefined) throw new Error('--pool-atomic is required')
  if (snapshotBlock === undefined) throw new Error('--snapshot-block is required')

  return { epoch: epoch!, poolAtomicUsdc, snapshotBlock }
}
