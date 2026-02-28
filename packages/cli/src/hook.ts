import { mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { initDb } from './store.js'
import type { HookInput } from './types.js'
import { handlePromptSubmit } from './hooks/prompt.js'
import { handlePostToolUse } from './hooks/tool-use.js'
import { handlePostToolUseFailure } from './hooks/tool-failure.js'
import { handleSessionStart } from './hooks/session-start.js'
import { handleSessionEnd } from './hooks/session-end.js'
import { handleStop } from './hooks/stop.js'

const DB_PATH = join(process.env.HOME ?? '~', '.pollen', 'local.db')

function ensureDir(filepath: string): void {
  mkdirSync(dirname(filepath), { recursive: true })
}

interface HookResult {
  pendingWork: Promise<void> | null
  db: ReturnType<typeof initDb>
}

/**
 * Runs the hook synchronously and returns any pending async work.
 * The caller is responsible for awaiting pendingWork before closing db.
 */
export function runHookSync(input: HookInput): HookResult {
  ensureDir(DB_PATH)
  const db = initDb(DB_PATH)
  let pendingWork: Promise<void> | null = null

  const event = input.hook_event_name ?? 'UserPromptSubmit'

  switch (event) {
    case 'UserPromptSubmit':
      pendingWork = handlePromptSubmit(db, input)
      break
    case 'PostToolUse':
      handlePostToolUse(db, input)
      break
    case 'PostToolUseFailure':
      handlePostToolUseFailure(db, input)
      break
    case 'SessionStart':
      handleSessionStart(db, input)
      break
    case 'SessionEnd':
      handleSessionEnd(db, input)
      break
    case 'Stop':
      handleStop(db, input)
      break
  }

  return { pendingWork, db }
}

// Backward-compat: awaits all work then closes db
export async function runHook(input: HookInput): Promise<void> {
  const { pendingWork, db } = runHookSync(input)
  try {
    if (pendingWork) await pendingWork
  } finally {
    db.close()
  }
}

// Main: read stdin, do sync work, unblock Claude Code, then await async work
async function main(): Promise<void> {
  let pendingWork: Promise<void> | null = null
  let db: ReturnType<typeof initDb> | null = null

  try {
    let data = ''
    for await (const chunk of process.stdin) {
      data += chunk
    }

    const input: HookInput = JSON.parse(data)
    const result = runHookSync(input)
    pendingWork = result.pendingWork
    db = result.db
  } catch {
    // Fail silently — never block Claude Code
  }

  // Unblock Claude Code FIRST
  process.stdout.write(JSON.stringify({ continue: true }))

  // Then wait for any pending async work (e.g. Haiku subject extraction)
  if (pendingWork) {
    try { await pendingWork } catch { /* never fail */ }
  }

  // Clean up
  if (db) {
    try { db.close() } catch { /* ignore */ }
  }
}

main()
