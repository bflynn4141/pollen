import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_NETWORK_API_URL } from './network-client.js'

export interface AdminDependencies {
  apiUrl: string
  secret: string
  fetchImpl: typeof fetch
}

export interface AdminCommandResult {
  ok: boolean
  output: string
}

function defaultDependencies(): AdminDependencies {
  const secretPath = join(process.env.HOME ?? '~', '.pollen', 'pollen-api-admin-secret')
  let secret = process.env.POLLEN_ADMIN_SECRET?.trim() ?? ''
  if (!secret) {
    try { secret = readFileSync(secretPath, 'utf8').trim() } catch { /* handled below */ }
  }
  return { apiUrl: DEFAULT_NETWORK_API_URL, secret, fetchImpl: fetch }
}

async function adminRequest(
  path: string,
  init: RequestInit,
  deps: AdminDependencies,
): Promise<unknown> {
  if (!deps.secret) {
    throw new Error('Admin secret not found. Set POLLEN_ADMIN_SECRET or install ~/.pollen/pollen-api-admin-secret.')
  }
  const response = await deps.fetchImpl(`${deps.apiUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${deps.secret}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
  return body
}

function parseDays(argv: string[]): number | null {
  const index = argv.indexOf('--days')
  const days = index === -1 ? 7 : Number(argv[index + 1])
  return Number.isInteger(days) && days >= 1 && days <= 30 ? days : null
}

export async function runAdminCommand(
  argv: string[],
  deps: AdminDependencies = defaultDependencies(),
): Promise<AdminCommandResult> {
  try {
    if (argv[0] === 'health') {
      const body = await adminRequest('/admin/contributions/health', { method: 'GET' }, deps) as any
      return {
        ok: true,
        output: [
          `Contribution pipeline: ${body.status}`,
          `  Contributors: ${body.contributors.registered} registered / ${body.contributors.active_tokens} active tokens`,
          `  Last 24h: ${body.ingest.receipts_24h} receipts / ${body.ingest.contributors_24h} contributors`,
          `  Invites: ${body.onboarding.active_invites} active`,
          `  Publishing: ${body.publishing.receipt_rollup_cells} receipt rollup cells`,
        ].join('\n'),
      }
    }

    if (argv[0] === 'invite' && argv[1] === 'create') {
      const days = parseDays(argv)
      if (days === null) return { ok: false, output: '--days must be an integer from 1 to 30.' }
      const body = await adminRequest('/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ expires_in_days: days }),
      }, deps) as any
      return {
        ok: true,
        output: [
          `Invite: ${body.code}`,
          `Expires: ${body.expires_at}`,
          'This code is shown once. Share it through a private channel.',
        ].join('\n'),
      }
    }

    if (argv[0] === 'invite' && argv[1] === 'list') {
      const body = await adminRequest('/admin/invites', { method: 'GET' }, deps) as any
      const invites = Array.isArray(body.invites) ? body.invites : []
      return {
        ok: true,
        output: invites.length === 0
          ? 'No invites found.'
          : invites.map((invite: any) =>
              `${invite.id}  ${invite.status}  expires ${invite.expires_at}`
            ).join('\n'),
      }
    }

    if (argv[0] === 'invite' && argv[1] === 'revoke' && argv[2]) {
      await adminRequest(`/admin/invites/${encodeURIComponent(argv[2])}/revoke`, {
        method: 'POST',
      }, deps)
      return { ok: true, output: `Revoked invite ${argv[2]}.` }
    }

    return {
      ok: false,
      output: [
        'Usage:',
        '  pollen admin health',
        '  pollen admin invite create [--days 7]',
        '  pollen admin invite list',
        '  pollen admin invite revoke <invite-id>',
      ].join('\n'),
    }
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) }
  }
}
