import { NextResponse } from 'next/server'
import { getDb } from '@/lib/neon'
import { validateIdKitResult } from './validation'

export const dynamic = 'force-dynamic'

function fail(code: string, status: number, detail?: string) {
  return NextResponse.json({ success: false, code, detail }, { status })
}

function validContributorId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)
}

function canonicalHexInteger(value: string): string {
  return `0x${BigInt(value).toString(16)}`
}

export async function POST(request: Request) {
  const rpId = process.env.WORLD_ID_RP_ID
  const action = process.env.WORLD_ID_ACTION ?? 'pollen-verify-v6'
  if (!rpId) return fail('not_configured', 500, 'WORLD_ID_RP_ID is not set')

  let body: { contributor_id?: unknown; idkit_result?: unknown }
  try {
    body = await request.json() as typeof body
  } catch {
    return fail('invalid_json', 400)
  }
  if (!validContributorId(body.contributor_id)) return fail('invalid_contributor_id', 400)
  const idkitValidation = validateIdKitResult(body.idkit_result, action, body.contributor_id)
  if (!idkitValidation.ok) {
    return fail(
      'invalid_idkit_result',
      400,
      `IDKit result failed validation at ${idkitValidation.stage}`,
    )
  }
  const idkitResult = idkitValidation.value

  const verifier = await fetch(`https://developer.world.org/api/v4/verify/${encodeURIComponent(rpId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(idkitResult),
  })
  const verifierBody = await verifier.text()
  let verified: { success?: boolean; code?: string; detail?: string; message?: string }
  try {
    verified = JSON.parse(verifierBody) as typeof verified
  } catch {
    return fail(
      'invalid_verifier_response',
      502,
      `status=${verifier.status}; content-type=${verifier.headers.get('content-type') ?? 'missing'}; bytes=${verifierBody.length}`,
    )
  }
  if (!verifier.ok || verified.success !== true) {
    return fail(
      verified.code ?? 'verification_failed',
      400,
      verified.detail ?? verified.message ?? `World ID verifier returned ${verifier.status}`,
    )
  }

  const nullifier = canonicalHexInteger(idkitResult.responses[0].nullifier)
  const verificationLevel = 'proof_of_human'
  const sql = getDb()
  try {
    const rows = await sql`
      INSERT INTO contributors (
        contributor_id, world_id_nullifier, verification_level, verified_at, updated_at
      )
      VALUES (${body.contributor_id}, ${nullifier}, ${verificationLevel}, NOW(), NOW())
      ON CONFLICT (contributor_id) DO UPDATE SET
        world_id_nullifier = EXCLUDED.world_id_nullifier,
        verification_level = EXCLUDED.verification_level,
        verified_at = EXCLUDED.verified_at,
        updated_at = NOW()
      WHERE contributors.world_id_nullifier IS NULL
         OR contributors.world_id_nullifier = EXCLUDED.world_id_nullifier
      RETURNING contributor_id
    `
    if (rows.length === 0) {
      return fail('contributor_already_bound', 409, 'Contributor has a different World ID')
    }
  } catch (error) {
    const dbError = error as Error & { code?: string }
    if (dbError.code === '23505' || dbError.message.includes('world_id_nullifier')) {
      return fail('nullifier_already_bound', 409, 'World ID belongs to a different contributor')
    }
    throw error
  }

  return NextResponse.json({
    success: true,
    nullifier,
    verification_level: verificationLevel,
  })
}
