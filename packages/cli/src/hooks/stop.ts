import type Database from 'better-sqlite3'
import { extractResponseMeta } from '../coarsen.js'
import { incrementResponseStats } from '../store.js'
import type { HookInput } from '../types.js'

export function handleStop(db: Database.Database, input: HookInput): void {
  if (!input.session_id) return

  const meta = extractResponseMeta(input.last_assistant_message)
  if (!meta) return

  incrementResponseStats(db, input.session_id, meta.char_count)
}
