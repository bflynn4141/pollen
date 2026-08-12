import { neon } from '@neondatabase/serverless'

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
}

const MAX_BODY_BYTES = 128 * 1024
const MAX_RECEIPTS = 100
const TOKEN_RE = /^pln_[A-Za-z0-9_-]{43}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const INTENTS = new Set([
  'debugging', 'feature_build', 'refactoring', 'learning', 'devops',
  'testing', 'documentation', 'code_review', 'exploration',
])
const AGENTS = new Set(['claude-code', 'codex'])
const TOOL_CATEGORIES = new Set(['read', 'write', 'execute', 'search', 'web', 'interact', 'unknown'])
const DURATION_BUCKETS = new Set(['quick', 'short', 'medium', 'long', 'marathon'])
const TERMINAL_STATES = new Set(['completed', 'abandoned', 'error_exit'])
const CHECK_RESULTS = new Set(['passed', 'failed', 'not_run', 'unknown'])
const RECEIPT_FIELDS = new Set([
  'schema_version', 'receipt_id', 'observed_at', 'intent', 'agent', 'model',
  'tool_category_sequence', 'duration_bucket', 'terminal_state', 'check_result',
])

export interface NetworkReceiptV1 {
  schema_version: 1
  receipt_id: string
  observed_at: number
  intent: string
  agent: 'claude-code' | 'codex'
  model: string
  tool_category_sequence: string[]
  duration_bucket: string
  terminal_state: string
  check_result: string
}

export interface IngestDependencies {
  registerContributor(contributorId: string, tokenHash: string): Promise<void>
  authenticateTokenHash(tokenHash: string): Promise<string | null>
  insertReceipts(contributorId: string, receipts: NetworkReceiptV1[]): Promise<number>
}

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertEnum(value: unknown, allowed: Set<string>, field: string): asserts value is string {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`invalid ${field}`)
  }
}

export function validateNetworkReceipt(value: unknown): NetworkReceiptV1 {
  if (!isRecord(value)) throw new Error('receipt must be an object')
  for (const field of Object.keys(value)) {
    if (!RECEIPT_FIELDS.has(field)) throw new Error(`unknown field: ${field}`)
  }
  for (const field of RECEIPT_FIELDS) {
    if (!(field in value)) throw new Error(`missing field: ${field}`)
  }
  if (value.schema_version !== 1) throw new Error('unsupported schema_version')
  if (typeof value.receipt_id !== 'string' || !UUID_RE.test(value.receipt_id)) {
    throw new Error('invalid receipt_id')
  }
  if (!Number.isSafeInteger(value.observed_at) || Number(value.observed_at) < Date.UTC(2020, 0, 1)) {
    throw new Error('invalid observed_at')
  }
  assertEnum(value.intent, INTENTS, 'intent')
  assertEnum(value.agent, AGENTS, 'agent')
  if (
    typeof value.model !== 'string'
    || value.model.length < 1
    || value.model.length > 80
    || !/^[A-Za-z0-9][A-Za-z0-9._:/+ -]*$/.test(value.model)
  ) {
    throw new Error('invalid model')
  }
  if (
    !Array.isArray(value.tool_category_sequence)
    || value.tool_category_sequence.length > 64
    || !value.tool_category_sequence.every(tool => typeof tool === 'string' && TOOL_CATEGORIES.has(tool))
  ) {
    throw new Error('invalid tool_category_sequence')
  }
  assertEnum(value.duration_bucket, DURATION_BUCKETS, 'duration_bucket')
  assertEnum(value.terminal_state, TERMINAL_STATES, 'terminal_state')
  assertEnum(value.check_result, CHECK_RESULTS, 'check_result')
  return value as unknown as NetworkReceiptV1
}

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  return `pln_${encoded}`
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function handleContributorRegistration(deps: IngestDependencies): Promise<Response> {
  const contributorId = crypto.randomUUID()
  const token = randomToken()
  await deps.registerContributor(contributorId, await sha256(token))
  return json({ contributor_id: contributorId, token, token_type: 'Bearer' }, 201)
}

export async function handleReceiptIngest(
  request: Request,
  deps: IngestDependencies,
): Promise<Response> {
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!TOKEN_RE.test(token)) return json({ error: 'unauthorized' }, 401)

  const contributorId = await deps.authenticateTokenHash(await sha256(token))
  if (!contributorId) return json({ error: 'unauthorized' }, 401)

  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413)

  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!isRecord(body) || Object.keys(body).some(key => key !== 'receipts') || !Array.isArray(body.receipts)) {
    return json({ error: 'invalid_batch' }, 400)
  }
  if (body.receipts.length < 1 || body.receipts.length > MAX_RECEIPTS) {
    return json({ error: 'invalid_batch_size' }, 400)
  }

  let receipts: NetworkReceiptV1[]
  try {
    receipts = body.receipts.map(validateNetworkReceipt)
  } catch (error) {
    return json({ error: 'invalid_receipt', detail: (error as Error).message }, 400)
  }

  const accepted = await deps.insertReceipts(contributorId, receipts)
  return json({ accepted, received: receipts.length }, 202)
}

export function createIngestDependencies(databaseUrl: string): IngestDependencies {
  const sql = neon(databaseUrl)
  return {
    async registerContributor(contributorId, tokenHash) {
      await sql`
        INSERT INTO contributors (contributor_id, updated_at)
        VALUES (${contributorId}, NOW())
        ON CONFLICT (contributor_id) DO NOTHING`
      await sql`
        INSERT INTO contributor_api_tokens (token_hash, contributor_id)
        VALUES (${tokenHash}, ${contributorId})`
    },
    async authenticateTokenHash(tokenHash) {
      const rows = await sql`
        UPDATE contributor_api_tokens
        SET last_used_at = NOW()
        WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
        RETURNING contributor_id`
      return rows[0]?.contributor_id ? String(rows[0].contributor_id) : null
    },
    async insertReceipts(contributorId, receipts) {
      let accepted = 0
      for (const receipt of receipts) {
        const rows = await sql`
          INSERT INTO network_receipts (
            receipt_id, contributor_id, observed_at, intent, agent, model,
            tool_category_sequence, duration_bucket, terminal_state, check_result
          ) VALUES (
            ${receipt.receipt_id}, ${contributorId}, ${receipt.observed_at},
            ${receipt.intent}, ${receipt.agent}, ${receipt.model},
            ${receipt.tool_category_sequence}, ${receipt.duration_bucket},
            ${receipt.terminal_state}, ${receipt.check_result}
          )
          ON CONFLICT (contributor_id, receipt_id) DO NOTHING
          RETURNING receipt_id`
        accepted += rows.length
      }
      return accepted
    },
  }
}
