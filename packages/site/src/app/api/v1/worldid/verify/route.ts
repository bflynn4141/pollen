import { NextResponse } from 'next/server'
import { getDb } from '@/lib/neon'

/**
 * POST /api/v1/worldid/verify
 *
 * Server-side World ID proof verification. The CLI (`pollen verify`) posts the
 * proof it received from the World App bridge; this route forwards it to
 * Worldcoin's cloud verifier and, on success, marks the contributor verified.
 *
 * This is an identity route, not a public data route — it talks to Neon
 * directly (never through rollup-queries).
 *
 * Responses:
 * - 200 { success: true, nullifier }
 * - 400 invalid body or proof rejected by Worldcoin
 * - 409 nullifier already bound to a different contributor (sybil attempt)
 * - 500 WORLD_ID_APP_ID not configured
 */

export const dynamic = 'force-dynamic'

interface VerifyRequestBody {
  contributor_id?: string
  proof?: string
  merkle_root?: string
  nullifier_hash?: string
  verification_level?: string
}

interface WorldcoinVerifyResponse {
  success?: boolean
  action?: string
  nullifier_hash?: string
  code?: string
  detail?: string
  attribute?: string | null
}

export async function POST(request: Request) {
  const appId = process.env.WORLD_ID_APP_ID
  if (!appId) {
    return NextResponse.json(
      { success: false, code: 'not_configured', detail: 'WORLD_ID_APP_ID is not set' },
      { status: 500 },
    )
  }
  const action = process.env.WORLD_ID_ACTION ?? 'pollen-verify'

  let body: VerifyRequestBody
  try {
    body = await request.json() as VerifyRequestBody
  } catch {
    return NextResponse.json({ success: false, code: 'invalid_json' }, { status: 400 })
  }

  const { contributor_id, proof, merkle_root, nullifier_hash, verification_level } = body
  if (!contributor_id || !proof || !merkle_root || !nullifier_hash || !verification_level) {
    return NextResponse.json(
      {
        success: false,
        code: 'missing_fields',
        detail: 'contributor_id, proof, merkle_root, nullifier_hash, verification_level are required',
      },
      { status: 400 },
    )
  }

  // 1. Verify the proof against Worldcoin's cloud verifier
  const wcRes = await fetch(`https://developer.worldcoin.org/api/v2/verify/${appId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nullifier_hash, merkle_root, proof, verification_level, action }),
  })

  let wcData: WorldcoinVerifyResponse = {}
  try {
    wcData = await wcRes.json() as WorldcoinVerifyResponse
  } catch {
    // fall through — treated as failure below
  }

  if (!wcRes.ok || wcData.success !== true) {
    return NextResponse.json(
      {
        success: false,
        code: wcData.code ?? 'verification_failed',
        detail: wcData.detail ?? `Worldcoin verify returned ${wcRes.status}`,
      },
      { status: 400 },
    )
  }

  const sql = getDb()

  // 2. A nullifier may only ever bind to one contributor (sybil resistance)
  const existing = await sql`
    SELECT contributor_id FROM contributors WHERE world_id_nullifier = ${nullifier_hash}
  `
  if (existing.length > 0 && existing[0].contributor_id !== contributor_id) {
    return NextResponse.json(
      {
        success: false,
        code: 'nullifier_already_bound',
        detail: 'This World ID is already linked to a different contributor',
      },
      { status: 409 },
    )
  }

  // 3. Upsert verification fields onto the contributor
  try {
    await sql`
      INSERT INTO contributors (contributor_id, world_id_nullifier, verification_level, verified_at, updated_at)
      VALUES (${contributor_id}, ${nullifier_hash}, ${verification_level}, NOW(), NOW())
      ON CONFLICT (contributor_id) DO UPDATE SET
        world_id_nullifier = EXCLUDED.world_id_nullifier,
        verification_level = EXCLUDED.verification_level,
        verified_at = EXCLUDED.verified_at,
        updated_at = NOW()
    `
  } catch (err) {
    // Unique-violation race: another contributor bound this nullifier between
    // the check above and the upsert.
    const message = (err as Error).message ?? ''
    if (message.includes('world_id_nullifier') || message.includes('duplicate key')) {
      return NextResponse.json(
        {
          success: false,
          code: 'nullifier_already_bound',
          detail: 'This World ID is already linked to a different contributor',
        },
        { status: 409 },
      )
    }
    throw err
  }

  return NextResponse.json({ success: true, nullifier: nullifier_hash })
}
