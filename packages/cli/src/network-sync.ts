import { uploadNetworkReceipts } from './network-client.js'
import type { NetworkReceiptV1 } from './network-receipt.js'

interface SyncNetworkReceiptsOptions {
  token: string
  receipts: NetworkReceiptV1[]
  apiUrl?: string
  upload?: typeof uploadNetworkReceipts
}

export type NetworkSyncResult =
  | { ok: true; accepted: number; received: number }
  | { ok: false; message: string }

export async function syncNetworkReceipts({
  token,
  receipts,
  apiUrl,
  upload = uploadNetworkReceipts,
}: SyncNetworkReceiptsOptions): Promise<NetworkSyncResult> {
  try {
    const result = await upload(token, receipts, apiUrl)
    return { ok: true, ...result }
  } catch (error) {
    const rawDetail = error instanceof Error ? error.message : String(error)
    const detail = rawDetail.replace(/\s+/g, ' ').trim() || 'unknown error'
    return { ok: false, message: `Could not sync receipts: ${detail}` }
  }
}
