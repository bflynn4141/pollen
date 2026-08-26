/**
 * Claude Code token accounting.
 *
 * Claude transcripts may repeat the same assistant message once per content
 * block. Usage belongs to the API response, so deduplicate by message id and
 * keep the last snapshot. Raw transcript content is parsed locally and is
 * never returned or persisted.
 */
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type Database from 'better-sqlite3'
import { classifyToolCategory, extractMcpServer } from './coarsen.js'
import { requeueNetworkReceipt } from './network-outbox.js'
import { insertToolEvent, updateSession } from './store.js'

const MAX_TRANSCRIPT_BYTES = 128 * 1024 * 1024
const MAX_JSON_LINE_BYTES = 8 * 1024 * 1024
const READ_BUFFER_BYTES = 64 * 1024

export interface NormalizedTokenUsage {
  /** Total prompt tokens, including cache reads and cache writes. */
  inputTokens: number
  outputTokens: number
  /** Cache-read tokens; a subset of inputTokens. */
  cachedInputTokens: number
  /** Reasoning tokens; a subset of outputTokens when reported. */
  reasoningTokens: number | null
}

interface UsageSnapshot extends NormalizedTokenUsage {}

export interface ClaudeTranscriptToolEvent {
  toolUseId: string
  toolName: string
  timestamp: number | null
  success: boolean
  attributedInputTokens: number | null
  attributedOutputTokens: number | null
  attributedCachedInputTokens: number | null
  attributedReasoningTokens: number | null
}

export interface ClaudeTranscriptSummary {
  tokenUsage: NormalizedTokenUsage | null
  dominantModel: string | null
  toolEvents: ClaudeTranscriptToolEvent[]
}

function tokenNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0
}

function optionalTokenNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null
}

function normalizeUsage(usage: Record<string, unknown>): UsageSnapshot {
  const cacheRead = tokenNumber(usage.cache_read_input_tokens)
  const cacheWrite = tokenNumber(usage.cache_creation_input_tokens)
  const directInput = tokenNumber(usage.input_tokens)
  const output = tokenNumber(usage.output_tokens)
  const outputDetails = usage.output_tokens_details as Record<string, unknown> | undefined
  const completionDetails = usage.completion_tokens_details as Record<string, unknown> | undefined
  const reasoning = optionalTokenNumber(usage.reasoning_tokens)
    ?? optionalTokenNumber(outputDetails?.reasoning_tokens)
    ?? optionalTokenNumber(completionDetails?.reasoning_tokens)

  return {
    inputTokens: directInput + cacheWrite + cacheRead,
    outputTokens: output,
    cachedInputTokens: cacheRead,
    reasoningTokens: reasoning,
  }
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function claudeModel(value: unknown): string | null {
  if (typeof value !== 'string' || !/^claude-[a-z0-9._-]+$/i.test(value)) return null
  return value.slice(0, 80)
}

interface ParsedTranscriptLine {
  key: string
  usage: UsageSnapshot | null
  model: string | null
  toolUses: Array<{
    toolUseId: string
    toolName: string
    timestamp: number | null
    responseKey: string
  }>
  toolResults: Array<{ toolUseId: string; success: boolean }>
}

function parseTranscriptLine(line: string, ordinal: number): ParsedTranscriptLine | null {
  if (line.length > MAX_JSON_LINE_BYTES) return null
  if (!line.includes('"usage"') && !line.includes('"model"') && !line.includes('"tool_use"') && !line.includes('"tool_result"')) return null
  try {
    const row = JSON.parse(line) as Record<string, unknown>
    const message = row.message as Record<string, unknown> | undefined
    const usage = message?.usage as Record<string, unknown> | undefined
    const messageId = typeof message?.id === 'string' ? message.id : null
    const uuid = typeof row.uuid === 'string' ? row.uuid : null
    const content = Array.isArray(message?.content) ? message.content : []
    const timestamp = parseTimestamp(row.timestamp)
    const responseKey = messageId ?? uuid ?? `usage-${ordinal}`
    const toolUses: ParsedTranscriptLine['toolUses'] = []
    const toolResults: ParsedTranscriptLine['toolResults'] = []
    for (const value of content) {
      if (value == null || typeof value !== 'object') continue
      const block = value as Record<string, unknown>
      if (
        block.type === 'tool_use'
        && typeof block.id === 'string'
        && typeof block.name === 'string'
      ) {
        toolUses.push({
          toolUseId: block.id,
          toolName: block.name.slice(0, 200),
          timestamp,
          responseKey,
        })
      }
      if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
        toolResults.push({ toolUseId: block.tool_use_id, success: block.is_error !== true })
      }
    }
    return {
      key: responseKey,
      usage: usage ? normalizeUsage(usage) : null,
      model: claudeModel(message?.model),
      toolUses,
      toolResults,
    }
  } catch {
    return null
  }
}

export function readClaudeTranscriptSummary(transcriptPath: string): ClaudeTranscriptSummary | null {
  if (extname(transcriptPath) !== '.jsonl' || !existsSync(transcriptPath)) return null
  let size: number
  try {
    size = statSync(transcriptPath).size
  } catch {
    return null
  }
  if (size <= 0 || size > MAX_TRANSCRIPT_BYTES) return null

  const snapshots = new Map<string, UsageSnapshot>()
  const modelByMessage = new Map<string, string>()
  const toolUses = new Map<string, ParsedTranscriptLine['toolUses'][number]>()
  const toolResults = new Map<string, boolean>()
  const decoder = new StringDecoder('utf8')
  const readBuffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
  let carry = ''
  let ordinal = 0
  let fd: number | null = null

  const processLine = (line: string) => {
    const parsed = parseTranscriptLine(line, ordinal++)
    if (!parsed) return
    if (parsed.usage) snapshots.set(parsed.key, parsed.usage)
    if (parsed.model) modelByMessage.set(parsed.key, parsed.model)
    for (const toolUse of parsed.toolUses) toolUses.set(toolUse.toolUseId, toolUse)
    for (const result of parsed.toolResults) toolResults.set(result.toolUseId, result.success)
  }

  try {
    fd = openSync(transcriptPath, 'r')
    let bytesRead = 0
    do {
      bytesRead = readSync(fd, readBuffer, 0, readBuffer.length, null)
      carry += decoder.write(readBuffer.subarray(0, bytesRead))
      let newline = carry.indexOf('\n')
      while (newline !== -1) {
        processLine(carry.slice(0, newline))
        carry = carry.slice(newline + 1)
        newline = carry.indexOf('\n')
      }
      // Tool outputs can form very large lines. They cannot contain a usage
      // record, so cap retained line memory while continuing the scan.
      if (carry.length > MAX_JSON_LINE_BYTES) carry = ''
    } while (bytesRead > 0)
    carry += decoder.end()
    if (carry) processLine(carry)
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }

  if (!snapshots.size && !modelByMessage.size && !toolUses.size) return null
  let inputTokens = 0
  let outputTokens = 0
  let cachedInputTokens = 0
  let reasoningTokens: number | null = null
  for (const usage of snapshots.values()) {
    inputTokens += usage.inputTokens
    outputTokens += usage.outputTokens
    cachedInputTokens += usage.cachedInputTokens
    if (usage.reasoningTokens !== null) {
      reasoningTokens = (reasoningTokens ?? 0) + usage.reasoningTokens
    }
  }
  const modelCounts = new Map<string, number>()
  for (const model of modelByMessage.values()) modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
  const dominantModel = [...modelCounts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null
  const callsPerResponse = new Map<string, number>()
  for (const toolUse of toolUses.values()) {
    callsPerResponse.set(toolUse.responseKey, (callsPerResponse.get(toolUse.responseKey) ?? 0) + 1)
  }
  const callIndex = new Map<string, number>()
  const split = (value: number | null, index: number, count: number): number | null => {
    if (value == null) return null
    return Math.floor(value / count) + (index < value % count ? 1 : 0)
  }
  return {
    tokenUsage: snapshots.size
      ? { inputTokens, outputTokens, cachedInputTokens, reasoningTokens }
      : null,
    dominantModel,
    toolEvents: [...toolUses.values()].map(toolUse => {
      const index = callIndex.get(toolUse.responseKey) ?? 0
      callIndex.set(toolUse.responseKey, index + 1)
      const count = callsPerResponse.get(toolUse.responseKey) ?? 1
      const usage = snapshots.get(toolUse.responseKey)
      return {
        toolUseId: toolUse.toolUseId,
        toolName: toolUse.toolName,
        timestamp: toolUse.timestamp,
        success: toolResults.get(toolUse.toolUseId) ?? true,
        attributedInputTokens: split(usage?.inputTokens ?? null, index, count),
        attributedOutputTokens: split(usage?.outputTokens ?? null, index, count),
        attributedCachedInputTokens: split(usage?.cachedInputTokens ?? null, index, count),
        attributedReasoningTokens: split(usage?.reasoningTokens ?? null, index, count),
      }
    }),
  }
}

export function readClaudeTokenUsage(transcriptPath: string): NormalizedTokenUsage | null {
  return readClaudeTranscriptSummary(transcriptPath)?.tokenUsage ?? null
}

function deterministicToolEventId(sessionId: string, toolUseId: string): string {
  return createHash('sha256').update(`${sessionId}:claude-tool:${toolUseId}`).digest('hex').slice(0, 32)
}

export function applyClaudeTranscriptSummary(
  db: Database.Database,
  sessionId: string,
  transcriptPath: string,
  now = Date.now(),
): boolean {
  const summary = readClaudeTranscriptSummary(transcriptPath)
  if (!summary) return false
  const session = db.prepare(
    "SELECT started_at, contributor_id FROM sessions WHERE session_id = ? AND source = 'claude-code'"
  ).get(sessionId) as { started_at: number; contributor_id: string | null } | undefined
  if (!session) return false

  if (summary.dominantModel) {
    db.prepare('UPDATE sessions SET model = ? WHERE session_id = ?')
      .run(summary.dominantModel, sessionId)
  }
  updateSession(db, {
    session_id: sessionId,
    ...(summary.tokenUsage ? {
      input_tokens: summary.tokenUsage.inputTokens,
      output_tokens: summary.tokenUsage.outputTokens,
      cached_input_tokens: summary.tokenUsage.cachedInputTokens,
      reasoning_tokens: summary.tokenUsage.reasoningTokens,
    } : {}),
  })

  const existing = new Set((db.prepare(
    'SELECT tool_use_id FROM tool_events WHERE session_id = ? AND tool_use_id IS NOT NULL'
  ).all(sessionId) as Array<{ tool_use_id: string }>).map(row => row.tool_use_id))
  const sequenceStart = (db.prepare(
    'SELECT COALESCE(MAX(sequence_number), -1) + 1 AS next FROM tool_events WHERE session_id = ?'
  ).get(sessionId) as { next: number }).next
  let inserted = 0
  for (const [index, event] of summary.toolEvents.entries()) {
    db.prepare(`
      UPDATE tool_events SET
        attributed_input_tokens = ?, attributed_output_tokens = ?,
        attributed_cached_input_tokens = ?, attributed_reasoning_tokens = ?
      WHERE session_id = ? AND tool_use_id = ?
    `).run(
      event.attributedInputTokens, event.attributedOutputTokens,
      event.attributedCachedInputTokens, event.attributedReasoningTokens,
      sessionId, event.toolUseId,
    )
    if (existing.has(event.toolUseId)) continue
    const mcpServer = extractMcpServer(event.toolName)
    if (!mcpServer) continue
    insertToolEvent(db, {
      id: deterministicToolEventId(sessionId, event.toolUseId),
      session_id: sessionId,
      timestamp: event.timestamp ?? session.started_at + index,
      tool_name: event.toolName,
      tool_category: classifyToolCategory(event.toolName),
      success: event.success,
      error_category: event.success ? null : 'unknown',
      file_extension: null,
      command_category: null,
      sequence_number: sequenceStart + inserted,
      mcp_server: mcpServer,
      duration_ms: null,
      contributor_id: session.contributor_id,
      response_type: event.success ? null : 'error_output',
      response_has_error: !event.success,
      tool_use_id: event.toolUseId,
      attributed_input_tokens: event.attributedInputTokens,
      attributed_output_tokens: event.attributedOutputTokens,
      attributed_cached_input_tokens: event.attributedCachedInputTokens,
      attributed_reasoning_tokens: event.attributedReasoningTokens,
    })
    existing.add(event.toolUseId)
    inserted++
  }
  requeueNetworkReceipt(db, sessionId, now)
  return true
}

export interface ClaudeTokenBackfillResult {
  files: number
  sessions: number
  skippedFiles: number
  warnings: string[]
}

interface ClaudeTokenBackfillOptions {
  projectsDir?: string
  days?: number
  now?: number
}

function collectJsonlFiles(root: string, cutoff: number): string[] {
  const files: string[] = []
  const pending = [root]
  while (pending.length) {
    const directory = pending.pop()!
    let entries
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          if (statSync(path).mtimeMs >= cutoff) files.push(path)
        } catch {
          // File disappeared during traversal.
        }
      }
    }
  }
  return files
}

export function backfillClaudeTokenUsage(
  db: Database.Database,
  options: ClaudeTokenBackfillOptions = {},
): ClaudeTokenBackfillResult {
  const now = options.now ?? Date.now()
  const days = options.days ?? 30
  const projectsDir = options.projectsDir ?? join(process.env.HOME ?? '~', '.claude', 'projects')
  const result: ClaudeTokenBackfillResult = { files: 0, sessions: 0, skippedFiles: 0, warnings: [] }
  if (!existsSync(projectsDir)) {
    result.warnings.push(`No Claude projects directory at ${projectsDir}`)
    return result
  }

  const cutoff = now - days * 24 * 60 * 60 * 1000
  const findSession = db.prepare(
    "SELECT session_id FROM sessions WHERE session_id = ? AND source = 'claude-code'"
  )
  for (const path of collectJsonlFiles(projectsDir, cutoff)) {
    result.files++
    const sessionId = basename(path, '.jsonl')
    if (!findSession.get(sessionId)) continue
    if (!applyClaudeTranscriptSummary(db, sessionId, path, now)) {
      result.skippedFiles++
      continue
    }
    result.sessions++
  }
  return result
}
