/**
 * `pollen verify` — World ID human verification flow.
 *
 * Verifies a contributor with Orb-backed World ID Proof of Human.
 * Stores nullifier_hash locally; attaches contributor_id to future sessions.
 */
import { loadConfig, saveConfig, getOrCreateContributorId } from './config.js'
import { createBridgeSession, formatPollFailure, pollForProof, verifyProof } from './worldid.js'

export async function runVerify({ save = true }: { save?: boolean } = {}): Promise<boolean> {
  // 1. Check if already verified (skip in no-save mode to allow re-demo)
  if (save) {
    const config = loadConfig()
    if (config?.world_id) {
      console.log('✓ Already verified')
      console.log(`  Contributor: ${config.contributor_id}`)
      console.log(`  Nullifier:   ${config.world_id.nullifier_hash.slice(0, 18)}...`)
      console.log(`  Level:       ${config.world_id.verification_level}`)
      console.log(`  Verified:    ${config.world_id.verified_at}`)
      return true
    }
  }

  // 2. Ensure contributor_id exists
  const contributorId = save ? getOrCreateContributorId() : 'demo'

  console.log('Starting World ID Proof of Human verification...')
  console.log('This requires an Orb-verified World ID.\n')

  // 3. Create bridge session
  const session = await createBridgeSession(contributorId)

  // 4. Display the QR/link handoff to World ID App
  console.log('Scan the QR code below with World ID App.\n')

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

  console.log('Or open this verification link on your phone:')
  console.log(`\n  ${session.connectorURI}\n`)
  console.log('Waiting for verification (5 min timeout)...\n')

  // 5. Poll for proof
  let proof
  try {
    proof = await pollForProof(session)
  } catch (error) {
    console.error(`✗ ${formatPollFailure(error)}`)
    return false
  }

  // 6. Verify server-side (pollen site route -> Worldcoin cloud verifier)
  console.log('Verifying proof...')
  const result = await verifyProof(proof, contributorId)

  if (!result.success) {
    const reason = [result.code, result.detail].filter(Boolean).join(' — ')
    console.error(`✗ Verification failed: ${reason || 'unknown error'}`)
    return false
  }

  // 7. Save to config (skipped in demo/no-save mode)
  if (save) {
    const updatedConfig = loadConfig() ?? { contributor_id: contributorId }
    updatedConfig.contributor_id = contributorId
    updatedConfig.world_id = {
      nullifier_hash: result.nullifier!,
      verification_level: result.verification_level!,
      verified_at: new Date().toISOString(),
    }
    saveConfig(updatedConfig)
  }

  console.log('✓ Orb-backed World ID verified!')
  console.log(`  Contributor: ${contributorId}`)
  console.log(`  Nullifier:   ${result.nullifier!.slice(0, 18)}...`)
  if (save) {
    console.log('\nYour contributor_id will be attached to future sessions.')
  }
  return true
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
    console.log('Run `pollen verify` to complete Orb-backed World ID verification.')
  }
}
