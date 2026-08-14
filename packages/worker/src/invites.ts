import { neon } from '@neondatabase/serverless'

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
}

export interface InviteDependencies {
  createInvite(inviteId: string, codeHash: string, expiresAt: Date): Promise<void>
  revokeInvite(inviteId: string): Promise<boolean>
}

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function randomInviteCode(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  return `pinv_${encoded}`
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function handleCreateInvite(request: Request, deps: InviteDependencies): Promise<Response> {
  let body: unknown = {}
  try {
    const raw = await request.text()
    body = raw ? JSON.parse(raw) : {}
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'invalid_request' }, 400)
  }
  const record = body as Record<string, unknown>
  if (Object.keys(record).some(key => key !== 'expires_in_days')) {
    return json({ error: 'invalid_request' }, 400)
  }
  const expiresInDays = record.expires_in_days ?? 7
  if (!Number.isInteger(expiresInDays) || Number(expiresInDays) < 1 || Number(expiresInDays) > 30) {
    return json({ error: 'invalid_expiry' }, 400)
  }

  const id = crypto.randomUUID()
  const code = randomInviteCode()
  const expiresAt = new Date(Date.now() + Number(expiresInDays) * 86_400_000)
  await deps.createInvite(id, await sha256(code), expiresAt)
  return json({ id, code, expires_at: expiresAt.toISOString() }, 201)
}

export async function handleRevokeInvite(
  _request: Request,
  inviteId: string,
  deps: InviteDependencies,
): Promise<Response> {
  const revoked = await deps.revokeInvite(inviteId)
  return revoked ? json({ ok: true }) : json({ error: 'invite_not_found' }, 404)
}

export function createInviteDependencies(databaseUrl: string): InviteDependencies {
  const sql = neon(databaseUrl)
  return {
    async createInvite(inviteId, codeHash, expiresAt) {
      await sql`
        INSERT INTO contributor_invites (invite_id, code_hash, expires_at)
        VALUES (${inviteId}, ${codeHash}, ${expiresAt.toISOString()})`
    },
    async revokeInvite(inviteId) {
      const rows = await sql`
        UPDATE contributor_invites
        SET revoked_at = NOW()
        WHERE invite_id = ${inviteId} AND used_at IS NULL AND revoked_at IS NULL
        RETURNING invite_id`
      return rows.length === 1
    },
  }
}
