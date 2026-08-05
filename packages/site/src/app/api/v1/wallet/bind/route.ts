import { getAddress, verifyMessage, type Hex } from 'viem'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/neon'

export const dynamic = 'force-dynamic'

function fail(code: string, status: number, detail?: string) {
  return NextResponse.json({ success: false, code, detail }, { status })
}

export async function POST(request: Request) {
  let body: { contributor_id?: unknown; wallet_address?: unknown; signature?: unknown }
  try {
    body = await request.json() as typeof body
  } catch {
    return fail('invalid_json', 400)
  }
  if (typeof body.contributor_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(body.contributor_id)) {
    return fail('invalid_contributor_id', 400)
  }
  if (typeof body.wallet_address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(body.wallet_address)) {
    return fail('invalid_wallet_address', 400)
  }
  if (typeof body.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(body.signature)) {
    return fail('invalid_signature', 400)
  }

  const walletAddress = getAddress(body.wallet_address)
  let valid = false
  try {
    valid = await verifyMessage({
      address: walletAddress,
      message: `pollen:register:${body.contributor_id}`,
      signature: body.signature as Hex,
    })
  } catch {
    return fail('invalid_signature', 400)
  }
  if (!valid) return fail('signature_mismatch', 401, 'Signature does not match wallet address')

  const sql = getDb()
  const rows = await sql`
    SELECT wallet_address
    FROM contributors
    WHERE contributor_id = ${body.contributor_id}
  `
  if (rows.length === 0) return fail('contributor_not_found', 404)
  const registered = rows[0].wallet_address as string | null
  if (!registered || registered.toLowerCase() !== walletAddress.toLowerCase()) {
    return fail('wallet_mismatch', 409, 'Signed wallet does not match the registered payout wallet')
  }

  await sql`
    UPDATE contributors
    SET wallet_binding_sig = ${body.signature}, updated_at = NOW()
    WHERE contributor_id = ${body.contributor_id}
  `
  return NextResponse.json({ success: true, contributor_id: body.contributor_id, wallet_address: walletAddress })
}
