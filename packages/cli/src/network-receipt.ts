import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'

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

export interface NetworkReceiptSummary {
  total: number
  codex: number
  claudeCode: number
  earliestObservedAt: number | null
  latestObservedAt: number | null
}

/** Aggregate-only preview for `pollen sync --dry-run`; contains no IDs. */
export function summarizeNetworkReceipts(receipts: NetworkReceiptV1[]): NetworkReceiptSummary {
  let earliestObservedAt: number | null = null
  let latestObservedAt: number | null = null
  let codex = 0
  let claudeCode = 0

  for (const receipt of receipts) {
    if (receipt.agent === 'codex') codex++
    else claudeCode++
    earliestObservedAt = earliestObservedAt == null
      ? receipt.observed_at
      : Math.min(earliestObservedAt, receipt.observed_at)
    latestObservedAt = latestObservedAt == null
      ? receipt.observed_at
      : Math.max(latestObservedAt, receipt.observed_at)
  }

  return { total: receipts.length, codex, claudeCode, earliestObservedAt, latestObservedAt }
}

interface ReceiptRow {
  session_id: string
  model: string
  source: string
  ended_at: number
  duration_bucket: string
  dominant_intent: string
  outcome: string
}

interface ToolRow {
  session_id: string
  tool_category: string
  success: number
  command_category: string | null
}

function deterministicReceiptId(contributorId: string, sessionId: string): string {
  const bytes = createHash('sha256')
    .update(`pollen-receipt-v1\0${contributorId}\0${sessionId}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function checkResult(tools: ToolRow[]): string {
  const checks = tools.filter(tool => tool.command_category === 'test' || tool.command_category === 'build')
  if (checks.length === 0) return 'not_run'
  return checks.some(tool => !tool.success) ? 'failed' : 'passed'
}

function normalizeModel(model: string): string {
  const normalized = model
    .trim()
    // Claude Code appends context-window metadata such as `[1m]` to the
    // underlying model identifier. It is capture metadata, not part of the ID.
    .replace(/(?:\[[^\]\r\n]*\])+$/, '')
    .trim()
    .replace(/[^A-Za-z0-9._:/+ -]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 80)

  return normalized || 'unknown'
}

/**
 * Construct the complete network payload from local data. This function is
 * the client-side privacy boundary; the server independently re-validates the
 * same closed schema and rejects extra fields.
 */
export function buildNetworkReceipts(
  db: Database.Database,
  contributorId: string,
): NetworkReceiptV1[] {
  const sessions = db.prepare(`
    SELECT session_id, model, source, ended_at, duration_bucket,
           dominant_intent, outcome
    FROM sessions
    WHERE ended_at IS NOT NULL
      AND model IS NOT NULL
      AND dominant_intent IS NOT NULL
      AND duration_bucket IS NOT NULL
      AND outcome IS NOT NULL
    ORDER BY ended_at
  `).all() as ReceiptRow[]

  const tools = db.prepare(`
    SELECT session_id, tool_category, success, command_category
    FROM tool_events
    ORDER BY session_id, sequence_number
  `).all() as ToolRow[]
  const toolsBySession = new Map<string, ToolRow[]>()
  for (const tool of tools) {
    const rows = toolsBySession.get(tool.session_id) ?? []
    rows.push(tool)
    toolsBySession.set(tool.session_id, rows)
  }

  return sessions.map(session => {
    const sessionTools = toolsBySession.get(session.session_id) ?? []
    return {
      schema_version: 1,
      receipt_id: deterministicReceiptId(contributorId, session.session_id),
      observed_at: session.ended_at,
      intent: session.dominant_intent,
      agent: session.source === 'codex' ? 'codex' : 'claude-code',
      model: normalizeModel(session.model),
      tool_category_sequence: sessionTools.slice(0, 64).map(tool => tool.tool_category),
      duration_bucket: session.duration_bucket,
      terminal_state: session.outcome,
      check_result: checkResult(sessionTools),
    }
  })
}
