import { NextResponse } from 'next/server'
import { signRequest } from '@worldcoin/idkit-core'

export const dynamic = 'force-dynamic'

export async function POST() {
  const appId = process.env.WORLD_ID_APP_ID
  const rpId = process.env.WORLD_ID_RP_ID
  const action = process.env.WORLD_ID_ACTION ?? 'pollen-verify-v2'
  const signingKey = process.env.RP_SIGNING_KEY
  if (!appId || !rpId || !signingKey) {
    return NextResponse.json(
      { success: false, code: 'not_configured' },
      { status: 500 },
    )
  }

  try {
    const signature = signRequest({ signingKeyHex: signingKey.trim(), action })
    return NextResponse.json({
      app_id: appId,
      rp_id: rpId,
      action,
      sig: signature.sig,
      nonce: signature.nonce,
      created_at: signature.createdAt,
      expires_at: signature.expiresAt,
    })
  } catch {
    return NextResponse.json(
      { success: false, code: 'not_configured' },
      { status: 500 },
    )
  }
}
