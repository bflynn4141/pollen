import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { initDb } from './store.js'
import type { HookInput } from './types.js'
import { handlePromptSubmit } from './hooks/prompt.js'
import { handlePostToolUse } from './hooks/tool-use.js'
import { handlePostToolUseFailure } from './hooks/tool-failure.js'
import { handleSessionStart } from './hooks/session-start.js'
import { handleSessionEnd } from './hooks/session-end.js'
import { handleStop } from './hooks/stop.js'
import { handleSubagentStart, handleSubagentStop } from './hooks/subagent.js'
import { handlePreToolUse } from './hooks/pre-tool-use.js'
import { handleNotification } from './hooks/notification.js'
import { handlePreCompact } from './hooks/context-compact.js'
import {
  handlePromptExpansion, handleStopFailure,
  handlePermissionRequest, handlePermissionDenied, handlePostCompact,
} from './hooks/capture-events.js'
import { handleCodexPostToolUse } from './codex-hook.js'
import { DB_PATH } from './config.js'
import { launchBackgroundNetworkSync } from './background-sync.js'

function ensureDir(filepath: string): void {
  mkdirSync(dirname(filepath), { recursive: true })
}

interface HookResult {
  pendingWork: Promise<void> | null
  db: ReturnType<typeof initDb>
  /** Optional user-visible message merged into the hook's stdout JSON */
  systemMessage?: string
  shouldSyncNetwork: boolean
}

/**
 * Runs the hook synchronously and returns any pending async work.
 * The caller is responsible for awaiting pendingWork before closing db.
 *
 * `source` is set from the `--source <name>` argv flag on the registered hook
 * command (Codex hooks are installed with `--source codex`). In Codex mode:
 * sessions are tagged source='codex', and PostToolUse payloads are inspected
 * for embedded errors (Codex has no PostToolUseFailure event).
 */
export function runHookSync(input: HookInput, source?: string): HookResult {
  ensureDir(DB_PATH)
  const db = initDb(DB_PATH)
  let pendingWork: Promise<void> | null = null

  const event = input.hook_event_name ?? 'UserPromptSubmit'
  const isCodex = source === 'codex'
  let systemMessage: string | undefined

  switch (event) {
    case 'UserPromptSubmit':
      pendingWork = handlePromptSubmit(db, input)
      break
    case 'PostToolUse':
      if (isCodex) {
        handleCodexPostToolUse(db, input)
      } else {
        handlePostToolUse(db, input)
      }
      break
    case 'PostToolUseFailure':
      handlePostToolUseFailure(db, input)
      break
    case 'SessionStart': {
      const output = handleSessionStart(db, input, isCodex ? 'codex' : 'claude-code')
      systemMessage = output?.systemMessage
      break
    }
    case 'SessionEnd':
      handleSessionEnd(db, input)
      break
    case 'Stop':
      handleStop(db, input)
      break
    case 'SubagentStart':
      handleSubagentStart(db, input)
      break
    case 'SubagentStop':
      handleSubagentStop(db, input)
      break
    case 'PreToolUse':
      handlePreToolUse(db, input)
      break
    case 'Notification':
      handleNotification(db, input)
      break
    case 'PreCompact':
      handlePreCompact(db, input)
      break
    case 'UserPromptExpansion':
      handlePromptExpansion(db, input)
      break
    case 'StopFailure':
      handleStopFailure(db, input)
      break
    case 'PermissionRequest':
      handlePermissionRequest(db, input)
      break
    case 'PermissionDenied':
      handlePermissionDenied(db, input)
      break
    case 'PostCompact':
      handlePostCompact(db, input)
      break
  }

  return {
    pendingWork,
    db,
    systemMessage,
    shouldSyncNetwork: event === 'SessionStart' || event === 'SessionEnd',
  }
}

// Backward-compat: awaits all work then closes db
export async function runHook(input: HookInput, source?: string): Promise<void> {
  const { pendingWork, db, shouldSyncNetwork } = runHookSync(input, source)
  try {
    if (pendingWork) await pendingWork
  } finally {
    db.close()
  }
  if (shouldSyncNetwork) launchBackgroundNetworkSync()
}

/** Parse `--source <name>` from the hook command's argv (e.g. `--source codex`) */
export function parseSourceFlag(argv: string[]): string | undefined {
  const idx = argv.indexOf('--source')
  if (idx === -1) return undefined
  const val = argv[idx + 1]
  return typeof val === 'string' && !val.startsWith('--') ? val : undefined
}

// Main: read stdin, do sync work, unblock Claude Code, then await async work
async function main(): Promise<void> {
  let pendingWork: Promise<void> | null = null
  let db: ReturnType<typeof initDb> | null = null
  let systemMessage: string | undefined
  let shouldSyncNetwork = false

  try {
    let data = ''
    for await (const chunk of process.stdin) {
      data += chunk
    }

    const input: HookInput = JSON.parse(data)
    const result = runHookSync(input, parseSourceFlag(process.argv))
    pendingWork = result.pendingWork
    db = result.db
    systemMessage = result.systemMessage
    shouldSyncNetwork = result.shouldSyncNetwork
  } catch {
    // Fail silently — never block Claude Code
  }

  // Unblock Claude Code FIRST. systemMessage (when present) is the only
  // extra field — Claude Code shows it to the user and continues normally.
  const output: Record<string, unknown> = { continue: true }
  if (systemMessage) output.systemMessage = systemMessage
  process.stdout.write(JSON.stringify(output))

  // Then wait for any pending async work (e.g. Haiku subject extraction)
  if (pendingWork) {
    try { await pendingWork } catch { /* never fail */ }
  }

  // Clean up
  if (db) {
    try { db.close() } catch { /* ignore */ }
  }
  if (shouldSyncNetwork) launchBackgroundNetworkSync()
}

main()
