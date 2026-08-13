/**
 * `pollen backfill --codex [--days N]` — ingest historical Codex sessions from
 * ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl into the local pollen DB.
 *
 * Rollout line shape (verified against real local files, cli_version 0.146.x):
 *   { timestamp: ISO8601, type: string, payload: { type?: string, ... } }
 *
 * Mapped line types (everything else is ignored):
 *   session_meta                          → sessions row (source='codex')
 *   turn_context                          → model (first seen wins)
 *   response_item/custom_tool_call        \
 *   response_item/function_call            } paired by call_id → tool_events
 *   response_item/custom_tool_call_output  }
 *   response_item/function_call_output    /
 *   event_msg/mcp_tool_call_end           → tool_events (mcp__<server>__<tool>)
 *   event_msg/token_count                 → session token totals (cumulative)
 *
 * Defensive by design: malformed lines are skipped, unknown types ignored,
 * files > 512MB skipped with a warning. Idempotent: tool event ids are
 * sha256(session_id + call_id) and all inserts are OR IGNORE / upserts.
 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { classify } from './classify.js'
import {
  classifyError,
  classifyToolCategory,
  detectProjectType,
  extractAction,
  extractMcpServer,
  extractTopic,
} from './coarsen.js'
import { MS_PER_DAY, getOrCreateContributorId } from './config.js'
import { extractFeatures } from './features.js'
import { coarsenDepth } from './session.js'
import { computeSessionArc } from './session-arc.js'
import {
  getSessionPromptCount,
  insertContribution,
  insertLifecycleEvent,
  insertSession,
  insertToolEvent,
  updateSession,
} from './store.js'
import type { TermDictionary } from './types.js'

// Codex desktop sessions can legitimately grow into the hundreds of MB during
// long-running agent work. Files are streamed line-by-line below, so keep a
// bounded ceiling without excluding normal extended sessions.
export const MAX_ROLLOUT_FILE_BYTES = 512 * 1024 * 1024

// Error heuristic for tool outputs (rollouts carry no explicit success flag
// on custom_tool_call_output — only the output text)
const OUTPUT_ERROR_PATTERN = /\b(error|failed|failure|exception|traceback|panic|ENOENT|EACCES|command not found|no such file)\b/i

export interface CodexBackfillResult {
  files: number
  skippedFiles: number
  sessions: number
  toolEvents: number
  warnings: string[]
}

interface BackfillOpts {
  days?: number
  sessionsDir?: string
  now?: number
}

interface PendingCall {
  name: string
  timestamp: number
}

let terms: TermDictionary | null = null

function loadTerms(): TermDictionary {
  if (terms) return terms
  const here = dirname(fileURLToPath(import.meta.url))
  terms = JSON.parse(readFileSync(join(here, '..', 'data', 'terms.json'), 'utf8')) as TermDictionary
  return terms
}

interface FileState {
  sessionId: string | null
  startedAt: number
  lastTs: number
  cwd: string | null
  model: string | null
  seq: number
  pending: Map<string, PendingCall>
  // token totals: token_count carries CUMULATIVE totals in
  // info.total_token_usage — keep the latest, don't sum
  inputTokens: number | null
  outputTokens: number | null
  cachedInputTokens: number | null
  toolEvents: number
  legacyPromptIndex: number
}

function deterministicId(sessionId: string, callId: string): string {
  return createHash('sha256').update(`${sessionId}:${callId}`).digest('hex').slice(0, 32)
}

function parseTs(iso: unknown, fallback: number): number {
  if (typeof iso !== 'string') return fallback
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : fallback
}

/** Join a rollout output payload (string, or array of { text } parts) into text */
function outputText(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    return output
      .map(part => (part != null && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string')
        ? (part as Record<string, string>).text
        : '')
      .join('')
  }
  return ''
}

function toNum(val: unknown): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? Math.trunc(val) : null
}

export async function backfillCodex(
  db: Database.Database,
  opts: BackfillOpts = {},
): Promise<CodexBackfillResult> {
  const days = opts.days ?? 30
  const now = opts.now ?? Date.now()
  const sessionsDir = opts.sessionsDir ?? join(process.env.HOME ?? '~', '.codex', 'sessions')

  const result: CodexBackfillResult = {
    files: 0, skippedFiles: 0, sessions: 0, toolEvents: 0, warnings: [],
  }
  if (!existsSync(sessionsDir)) {
    result.warnings.push(`No Codex sessions directory at ${sessionsDir}`)
    return result
  }

  const cutoff = now - days * MS_PER_DAY

  for (const file of collectRolloutFiles(sessionsDir, cutoff)) {
    let size: number
    try {
      size = statSync(file).size
    } catch {
      result.skippedFiles++
      continue
    }
    if (size > MAX_ROLLOUT_FILE_BYTES) {
      result.skippedFiles++
      result.warnings.push(`Skipped ${file} (${Math.round(size / 1024 / 1024)}MB > 512MB)`)
      continue
    }

    try {
      const state = await processRolloutFile(db, file)
      result.files++
      if (state.sessionId) {
        result.sessions++
        result.toolEvents += state.toolEvents
      }
    } catch (err) {
      result.skippedFiles++
      result.warnings.push(`Failed to parse ${file}: ${(err as Error).message}`)
    }
  }

  return result
}

/** Walk sessionsDir/YYYY/MM/DD, keeping day-directories within the cutoff */
function collectRolloutFiles(sessionsDir: string, cutoff: number): string[] {
  const files: string[] = []
  let years: string[]
  try {
    years = readdirSync(sessionsDir)
  } catch {
    return files
  }

  for (const year of years.sort()) {
    if (!/^\d{4}$/.test(year)) continue
    const yearDir = join(sessionsDir, year)
    let months: string[]
    try { months = readdirSync(yearDir) } catch { continue }

    for (const month of months.sort()) {
      if (!/^\d{2}$/.test(month)) continue
      const monthDir = join(yearDir, month)
      let dayDirs: string[]
      try { dayDirs = readdirSync(monthDir) } catch { continue }

      for (const day of dayDirs.sort()) {
        if (!/^\d{2}$/.test(day)) continue
        // End of the UTC day must be within the window
        const dayEnd = Date.UTC(Number(year), Number(month) - 1, Number(day)) + MS_PER_DAY
        if (dayEnd < cutoff) continue

        const dayDir = join(monthDir, day)
        let entries: string[]
        try { entries = readdirSync(dayDir) } catch { continue }
        for (const entry of entries.sort()) {
          if (entry.startsWith('rollout-') && entry.endsWith('.jsonl')) {
            files.push(join(dayDir, entry))
          }
        }
      }
    }
  }

  return files
}

async function processRolloutFile(db: Database.Database, file: string): Promise<FileState> {
  const contributorId = getOrCreateContributorId()
  const state: FileState = {
    sessionId: null,
    startedAt: 0,
    lastTs: 0,
    cwd: null,
    model: null,
    seq: 0,
    pending: new Map(),
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    toolEvents: 0,
    legacyPromptIndex: 0,
  }

  const rl = createInterface({
    input: createReadStream(file, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(trimmed)
    } catch {
      continue // malformed line — skip
    }
    if (obj == null || typeof obj !== 'object') continue

    const ts = parseTs(obj.timestamp, state.lastTs)
    if (ts > state.lastTs) state.lastTs = ts

    const type = obj.type
    const payload = (obj.payload ?? {}) as Record<string, unknown>
    const payloadType = payload.type

    if (type === 'session_meta') {
      handleSessionMeta(db, state, payload, ts, contributorId)
    } else if (type === 'turn_context') {
      if (state.model == null && typeof payload.model === 'string') {
        state.model = payload.model
      }
    } else if (type === 'response_item') {
      if (payloadType === 'message' && payload.role === 'user') {
        handleUserMessage(db, state, payload, ts, contributorId)
      } else if (payloadType === 'custom_tool_call' || payloadType === 'function_call') {
        if (typeof payload.call_id === 'string') {
          state.pending.set(payload.call_id, {
            name: typeof payload.name === 'string' && payload.name.length > 0 ? payload.name : 'unknown',
            timestamp: ts,
          })
        }
      } else if (payloadType === 'custom_tool_call_output' || payloadType === 'function_call_output') {
        handleToolOutput(db, state, payload, ts, contributorId)
      }
      // other response_item types (reasoning, message, ...) — ignored
    } else if (type === 'event_msg') {
      if (payloadType === 'user_message' && typeof payload.message === 'string') {
        handlePromptText(
          db,
          state,
          payload.message,
          `legacy:${state.legacyPromptIndex++}`,
          ts,
          contributorId,
        )
      } else if (payloadType === 'token_count') {
        handleTokenCount(state, payload)
      } else if (payloadType === 'mcp_tool_call_end') {
        handleMcpToolCallEnd(db, state, payload, ts, contributorId)
      }
      // other event_msg types — ignored
    }
    // unknown top-level types (world_state, compacted, ...) — ignored
  }

  finalizeSession(db, state)
  return state
}

/**
 * Normalize a Codex user message through the same feature extraction and
 * classifier used by Claude's UserPromptSubmit hook. Codex may prepend app
 * context and AGENTS instructions as separate input_text parts, so the final
 * text part is the user-authored prompt. Raw text is used in memory only and
 * is never persisted.
 */
function handleUserMessage(
  db: Database.Database,
  state: FileState,
  payload: Record<string, unknown>,
  ts: number,
  contributorId: string,
): void {
  if (!state.sessionId || typeof payload.id !== 'string' || !Array.isArray(payload.content)) return

  const parts = payload.content as Array<Record<string, unknown>>
  const text = parts
    .filter(part => part?.type === 'input_text' && typeof part.text === 'string')
    .map(part => String(part.text))
    .at(-1)
    ?.trim()
  if (!text) return

  handlePromptText(db, state, text, `message:${payload.id}`, ts, contributorId)
}

function handlePromptText(
  db: Database.Database,
  state: FileState,
  text: string,
  promptKey: string,
  ts: number,
  contributorId: string,
): void {
  if (!state.sessionId || !text.trim()) return
  const id = deterministicId(state.sessionId, `prompt:${promptKey}`)
  const exists = db.prepare('SELECT 1 FROM contributions WHERE id = ?').get(id)
  if (exists) return

  const dictionary = loadTerms()
  const features = extractFeatures(text, dictionary, new Date(ts))
  features.session_depth = coarsenDepth(getSessionPromptCount(db, state.sessionId) + 1)
  const labels = classify(features, dictionary)

  insertContribution(db, {
    id,
    timestamp: ts,
    session_id: state.sessionId,
    features,
    labels,
    action: extractAction(text),
    topic: extractTopic(text),
    contributor_id: contributorId,
    permission_mode: null,
  })
}

function handleSessionMeta(
  db: Database.Database,
  state: FileState,
  payload: Record<string, unknown>,
  ts: number,
  contributorId: string,
): void {
  const sessionId = typeof payload.session_id === 'string'
    ? payload.session_id
    : typeof payload.id === 'string' ? payload.id : null
  if (!sessionId) return

  state.sessionId = sessionId
  state.cwd = typeof payload.cwd === 'string' ? payload.cwd : null
  state.startedAt = parseTs(payload.timestamp, ts)

  insertSession(db, {
    session_id: sessionId,
    model: null, // arrives later via turn_context
    source: 'codex',
    started_at: state.startedAt,
    ended_at: null,
    duration_bucket: null,
    prompt_count: 0,
    tool_use_count: 0,
    tool_failure_count: 0,
    intent_sequence: null,
    dominant_intent: null,
    dominant_domain: null,
    unique_tools: null,
    languages_used: null,
    outcome: null,
    project_type: detectProjectType(state.cwd ?? undefined),
    end_reason: null,
    mcp_servers_used: null,
    response_count: 0,
    avg_response_length: 0,
    satisfaction_score: null,
    satisfaction_signals: null,
    subject: null,
    contributor_id: contributorId,
  })

  // Record cli_version/originator as a lifecycle event (deterministic id →
  // re-runs no-op via INSERT OR IGNORE)
  insertLifecycleEvent(db, {
    id: deterministicId(sessionId, 'session_meta'),
    session_id: sessionId,
    timestamp: state.startedAt,
    event_type: 'codex_session_meta',
    metadata: JSON.stringify({
      cli_version: typeof payload.cli_version === 'string' ? payload.cli_version : null,
      originator: typeof payload.originator === 'string' ? payload.originator : null,
    }),
    contributor_id: contributorId,
  })
}

function handleToolOutput(
  db: Database.Database,
  state: FileState,
  payload: Record<string, unknown>,
  ts: number,
  contributorId: string,
): void {
  if (!state.sessionId) return
  const callId = payload.call_id
  if (typeof callId !== 'string') return

  const call = state.pending.get(callId)
  if (!call) return // output without a recorded call — skip defensively
  state.pending.delete(callId)

  const text = outputText(payload.output)
  const hasError = text.length > 0 && OUTPUT_ERROR_PATTERN.test(text.slice(0, 4000))

  insertToolEvent(db, {
    id: deterministicId(state.sessionId, callId),
    session_id: state.sessionId,
    timestamp: call.timestamp,
    tool_name: call.name,
    tool_category: classifyToolCategory(call.name),
    success: !hasError,
    error_category: hasError ? classifyError(text) : null,
    file_extension: null,
    command_category: null,
    sequence_number: state.seq++,
    mcp_server: extractMcpServer(call.name),
    duration_ms: ts > call.timestamp ? ts - call.timestamp : null,
    contributor_id: contributorId,
    response_type: hasError ? 'error_output' : 'command_output',
    response_size: text.length > 0 ? text.length : null,
    response_has_error: hasError,
  })
  state.toolEvents++
}

function handleMcpToolCallEnd(
  db: Database.Database,
  state: FileState,
  payload: Record<string, unknown>,
  ts: number,
  contributorId: string,
): void {
  if (!state.sessionId) return
  const callId = typeof payload.call_id === 'string' ? payload.call_id : null
  if (!callId) return

  const invocation = (payload.invocation ?? {}) as Record<string, unknown>
  const server = typeof invocation.server === 'string' ? invocation.server : 'unknown'
  const tool = typeof invocation.tool === 'string' ? invocation.tool : 'unknown'
  const toolName = `mcp__${server}__${tool}`

  // result: { Ok: { isError?: bool, ... } } | { Err: ... }
  const resultVal = payload.result as Record<string, unknown> | undefined
  const ok = resultVal?.Ok as Record<string, unknown> | undefined
  const failed = resultVal != null && ('Err' in resultVal || ok?.isError === true)

  // duration: { secs, nanos }
  const duration = payload.duration as Record<string, unknown> | undefined
  const durationMs = duration != null
    ? (toNum(duration.secs) ?? 0) * 1000 + Math.round((toNum(duration.nanos) ?? 0) / 1e6)
    : null

  insertToolEvent(db, {
    id: deterministicId(state.sessionId, callId),
    session_id: state.sessionId,
    timestamp: ts,
    tool_name: toolName,
    tool_category: classifyToolCategory(toolName),
    success: !failed,
    error_category: failed ? 'unknown' : null,
    file_extension: null,
    command_category: null,
    sequence_number: state.seq++,
    mcp_server: server,
    duration_ms: durationMs,
    contributor_id: contributorId,
    response_type: failed ? 'error_output' : null,
    response_has_error: failed ? true : null,
  })
  state.toolEvents++
}

function handleTokenCount(state: FileState, payload: Record<string, unknown>): void {
  const info = payload.info as Record<string, unknown> | undefined
  if (info == null) return

  const total = info.total_token_usage as Record<string, unknown> | undefined
  if (total != null) {
    // Cumulative session totals — latest snapshot wins
    state.inputTokens = toNum(total.input_tokens) ?? state.inputTokens
    state.outputTokens = toNum(total.output_tokens) ?? state.outputTokens
    state.cachedInputTokens = toNum(total.cached_input_tokens) ?? state.cachedInputTokens
    return
  }

  // Fallback: no cumulative snapshot — accumulate per-turn deltas
  const last = info.last_token_usage as Record<string, unknown> | undefined
  if (last != null) {
    const input = toNum(last.input_tokens)
    const output = toNum(last.output_tokens)
    const cached = toNum(last.cached_input_tokens)
    if (input != null) state.inputTokens = (state.inputTokens ?? 0) + input
    if (output != null) state.outputTokens = (state.outputTokens ?? 0) + output
    if (cached != null) state.cachedInputTokens = (state.cachedInputTokens ?? 0) + cached
  }
}

function finalizeSession(db: Database.Database, state: FileState): void {
  if (!state.sessionId) return

  // Model arrives via turn_context after the insert — fill in when absent
  if (state.model) {
    db.prepare('UPDATE sessions SET model = COALESCE(model, ?) WHERE session_id = ?')
      .run(state.model, state.sessionId)
  }

  const endedAt = Math.max(state.lastTs, state.startedAt)
  const arc = computeSessionArc(db, state.sessionId, state.startedAt, endedAt)

  const mcpRows = db.prepare(
    'SELECT DISTINCT mcp_server FROM tool_events WHERE session_id = ? AND mcp_server IS NOT NULL'
  ).all(state.sessionId) as { mcp_server: string }[]
  const mcpServers = mcpRows.map(r => r.mcp_server)

  updateSession(db, {
    session_id: state.sessionId,
    ended_at: endedAt,
    end_reason: 'codex_backfill',
    mcp_servers_used: mcpServers.length > 0 ? JSON.stringify(mcpServers) : null,
    input_tokens: state.inputTokens,
    output_tokens: state.outputTokens,
    cached_input_tokens: state.cachedInputTokens,
    ...arc,
  })
}
