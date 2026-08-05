import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { getOrCreateContributorId } from '../config.js'
import { insertLifecycleEvent } from '../store.js'
import type { HookInput } from '../types.js'

export function handlePreToolUse(db: Database.Database, input: HookInput): void {
  if (!input.session_id) return

  insertLifecycleEvent(db, {
    id: randomUUID(),
    session_id: input.session_id,
    timestamp: Date.now(),
    event_type: 'pre_tool_use',
    metadata: JSON.stringify({
      tool_name: input.tool_name ?? null,
      permission_mode: input.permission_mode ?? null,
    }),
    contributor_id: getOrCreateContributorId(),
  })
}
