/**
 * `pollen verify` — World ID human verification flow.
 *
 * Proves a contributor is a unique human via device-level verification.
 * Stores nullifier_hash locally; attaches contributor_id to future sessions.
 */
import { loadConfig, saveConfig, getOrCreateContributorId } from './config.js'
import { createBridgeSession, pollForProof, verifyProof } from './worldid.js'

export async function runVerify({ save = true }: { save?: boolean } = {}): Promise<void> {
  // 1. Check if already verified (skip in no-save mode to allow re-demo)
  if (save) {
    const config = loadConfig()
    if (config?.world_id) {
      console.log('✓ Already verified')
      console.log(`  Contributor: ${config.contributor_id}`)
      console.log(`  Nullifier:   ${config.world_id.nullifier_hash.slice(0, 18)}...`)
      console.log(`  Level:       ${config.world_id.verification_level}`)
      console.log(`  Verified:    ${config.world_id.verified_at}`)
      return
    }
  }

  // 2. Ensure contributor_id exists
  const contributorId = save ? getOrCreateContributorId() : 'demo'

  console.log('Starting World ID verification...')
  console.log('This proves you are a unique human (device-level, no biometrics).\n')

  // 3. Create bridge session
  const session = await createBridgeSession()

  // 4. Display QR code + fallback URL
  try {
    const mod = await import('qrcode-terminal')
    const qrcode = mod.default ?? mod
    await new Promise<void>((resolve) => {
      qrcode.generate(session.connectorURI, { small: true }, (qr: string) => {
        console.log(qr)
        resolve()
      })
    })
  } catch (err) {
    // qrcode-terminal failed — show URL only
    console.error('(QR code unavailable:', (err as Error).message, ')')
  }

  console.log('Scan the QR code with World App, or open this URL on your phone:')
  console.log(`\n  ${session.connectorURI}\n`)
  console.log('Waiting for verification (2 min timeout)...\n')

  // 5. Poll for proof
  const proof = await pollForProof(session)

  // 6. Verify server-side
  console.log('Verifying proof...')
  const result = await verifyProof(proof)

  if (!result.success) {
    console.error(`✗ Verification failed: ${result.code ?? result.detail ?? 'unknown error'}`)
    process.exit(1)
  }

  // 7. Save to config (skipped in demo/no-save mode)
  if (save) {
    const updatedConfig = loadConfig() ?? { contributor_id: contributorId }
    updatedConfig.contributor_id = contributorId
    updatedConfig.world_id = {
      nullifier_hash: proof.nullifier_hash,
      verification_level: proof.verification_level,
      verified_at: new Date().toISOString(),
    }
    saveConfig(updatedConfig)
  }

  console.log('✓ Verified! You are a unique human.')
  console.log(`  Contributor: ${contributorId}`)
  console.log(`  Nullifier:   ${proof.nullifier_hash.slice(0, 18)}...`)
  if (save) {
    console.log('\nYour contributor_id will be attached to future sessions.')
  }
}

export function runStatus(): void {
  const config = loadConfig()
  if (!config) {
    console.log('No pollen config found. Run `pollen verify` to set up identity.')
    return
  }

  console.log(`Contributor ID: ${config.contributor_id}`)

  if (config.world_id) {
    console.log(`World ID:       ✓ verified (${config.world_id.verification_level})`)
    console.log(`Nullifier:      ${config.world_id.nullifier_hash.slice(0, 18)}...`)
    console.log(`Verified at:    ${config.world_id.verified_at}`)
  } else {
    console.log('World ID:       not verified')
    console.log('Run `pollen verify` to prove you are a unique human.')
  }
}
