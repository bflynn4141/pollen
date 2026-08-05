/**
 * `pollen-agent payout --preflight` — validate the Splits wiring without
 * proposing anything. Intended as Brian's first authenticated run:
 *
 *   1. `splits auth whoami` succeeds (API key valid) and reports a local
 *      EOA signing key registered with the backend (signTransaction needs it).
 *   2. SPLITS_SUBACCOUNT resolves to an onchain address in the org.
 *   3. That address holds MINTER_ROLE on PollenTokenV2 (viem read), and the
 *      contract's currentEpoch() is reachable.
 */
import { createPublicClient, http, type Address } from 'viem'
import { base } from 'viem/chains'
import { MINTER_ROLE, POLLEN_TOKEN_V2_ABI } from './abi.js'
import { resolveSubaccount, whoami, type SplitsDriver } from './splits.js'

export interface PreflightOptions {
  subaccount: string
  tokenAddress: Address
  rpcUrl?: string
  log?: (line: string) => void
}

export async function runPreflight(driver: SplitsDriver, opts: PreflightOptions): Promise<boolean> {
  const log = opts.log ?? console.log
  let ok = true

  // 1. API key + local signer
  let identity
  try {
    identity = await whoami(driver)
    log(`✓ splits auth whoami: ${JSON.stringify(identity.raw).slice(0, 200)}`)
  } catch (err) {
    log(`✗ splits auth whoami failed: ${(err as Error).message}`)
    log('  Set SPLITS_API_KEY (Splits Settings -> API Keys) or run `splits auth login`.')
    return false
  }
  if (identity.localKeyRegistered) {
    log('✓ local EOA signing key present and registered (transactions sign will work)')
  } else {
    ok = false
    log('✗ no registered local EOA signing key — `splits transactions sign` will fail.')
    log('  Fix: `splits auth create-key --register` (or `echo $PRIVATE_KEY | splits auth import-key` then `splits auth register-signer <address>`),')
    log('  then attach it to the subaccount: `splits accounts update-signers <address> --add-eoa-signer-ids <id>`.')
  }

  // 2. Subaccount exists
  let address: Address
  try {
    address = await resolveSubaccount(driver, opts.subaccount)
    log(`✓ subaccount resolved: ${opts.subaccount} -> ${address}`)
  } catch (err) {
    log(`✗ subaccount check failed: ${(err as Error).message}`)
    return false
  }

  // 3. MINTER_ROLE on-chain
  const publicClient = createPublicClient({
    chain: base,
    transport: http(opts.rpcUrl ?? 'https://mainnet.base.org'),
  })
  try {
    const [hasMinterRole, currentEpoch] = await Promise.all([
      publicClient.readContract({
        address: opts.tokenAddress,
        abi: POLLEN_TOKEN_V2_ABI,
        functionName: 'hasRole',
        args: [MINTER_ROLE, address],
      }),
      publicClient.readContract({
        address: opts.tokenAddress,
        abi: POLLEN_TOKEN_V2_ABI,
        functionName: 'currentEpoch',
      }),
    ])
    log(`✓ PollenTokenV2 reachable at ${opts.tokenAddress} (currentEpoch=${currentEpoch})`)
    if (hasMinterRole) {
      log(`✓ subaccount holds MINTER_ROLE`)
    } else {
      ok = false
      log(`✗ subaccount ${address} does NOT hold MINTER_ROLE on ${opts.tokenAddress}.`)
      log('  Deploy with MINTER_ADDRESS=<subaccount> (script/DeployV2.s.sol) or grant it from the admin wallet.')
    }
  } catch (err) {
    ok = false
    log(`✗ on-chain MINTER_ROLE check failed: ${(err as Error).message}`)
  }

  log(ok ? 'Preflight passed.' : 'Preflight FAILED — fix the issues above before the first payout.')
  return ok
}
