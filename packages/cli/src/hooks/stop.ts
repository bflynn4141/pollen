import type Database from 'better-sqlite3'
import { extractResponseMeta } from '../coarsen.js'
import { incrementResponseStats } from '../store.js'
import type { HookInput } from '../types.js'

export function handleStop(db: Database.Database, input: HookInput): void {
  if (!input.session_id) return

  // v5: Stop carries the running tool_use_count — the last one wins
  if (typeof input.tool_use_count === 'number' && Number.isFinite(input.tool_use_count)) {
    db.prepare('UPDATE sessions SET stop_tool_use_count = ? WHERE session_id = ?')
      .run(Math.trunc(input.tool_use_count), input.session_id)
  }

  const meta = extractResponseMeta(input.last_assistant_message)
  if (!meta) return

  incrementResponseStats(db, input.session_id, meta.char_count)
}
