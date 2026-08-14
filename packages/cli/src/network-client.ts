import type { NetworkReceiptV1 } from './network-receipt.js'

export const DEFAULT_NETWORK_API_URL = process.env.POLLEN_API_URL
  ?? 'https://pollen-api.bflynn4141.workers.dev'

export interface NetworkRegistration {
  contributorId: string
  token: string
}

async function responseError(response: Response): Promise<Error> {
  let detail = `HTTP ${response.status}`
  try {
    const body = await response.json() as { error?: string; detail?: string }
    detail = body.detail ?? body.error ?? detail
  } catch { /* use status */ }
  return new Error(detail)
}

export async function registerNetworkContributor(
  inviteCode: string,
  apiUrl = DEFAULT_NETWORK_API_URL,
  fetchImpl: typeof fetch = fetch,
  existingContributorId?: string,
): Promise<NetworkRegistration> {
  const response = await fetchImpl(`${apiUrl}/api/v1/contributors/register`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'x-pollen-invite': inviteCode,
      ...(existingContributorId === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(existingContributorId === undefined
      ? {}
      : { body: JSON.stringify({ contributor_id: existingContributorId }) }),
  })
  if (!response.ok) throw await responseError(response)
  const body = await response.json() as { contributor_id?: unknown; token?: unknown }
  if (
    typeof body.contributor_id !== 'string'
    || typeof body.token !== 'string'
    || !body.token.startsWith('pln_')
  ) {
    throw new Error('invalid registration response')
  }
  return { contributorId: body.contributor_id, token: body.token }
}

export async function uploadNetworkReceipts(
  token: string,
  receipts: NetworkReceiptV1[],
  apiUrl = DEFAULT_NETWORK_API_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accepted: number; received: number }> {
  let accepted = 0
  let received = 0
  for (let index = 0; index < receipts.length; index += 100) {
    const batch = receipts.slice(index, index + 100)
    const response = await fetchImpl(`${apiUrl}/api/v1/receipts`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ receipts: batch }),
    })
    if (!response.ok) throw await responseError(response)
    const body = await response.json() as { accepted?: unknown; received?: unknown }
    if (typeof body.accepted !== 'number' || typeof body.received !== 'number') {
      throw new Error('invalid ingest response')
    }
    accepted += body.accepted
    received += body.received
  }
  return { accepted, received }
}
