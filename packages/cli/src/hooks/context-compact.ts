import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { getOrCreateContributorId } from '../config.js'
import { insertLifecycleEvent } from '../store.js'
import type { HookInput } from '../types.js'

export function handlePreCompact(db: Database.Database, input: HookInput): void {
  if (!input.session_id) return

  insertLifecycleEvent(db, {
    id: randomUUID(),
    session_id: input.session_id,
    timestamp: Date.now(),
    event_type: 'pre_compact',
    metadata: JSON.stringify({
      context_size: input.context_size ?? null,
      conversation_length: input.conversation_length ?? null,
    }),
    contributor_id: getOrCreateContributorId(),
  })
}
