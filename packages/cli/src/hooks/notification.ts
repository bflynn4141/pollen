import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { getOrCreateContributorId } from '../config.js'
import { insertLifecycleEvent } from '../store.js'
import type { HookInput } from '../types.js'

export function handleNotification(db: Database.Database, input: HookInput): void {
  if (!input.session_id) return

  insertLifecycleEvent(db, {
    id: randomUUID(),
    session_id: input.session_id,
    timestamp: Date.now(),
    event_type: 'notification',
    metadata: JSON.stringify({
      notification_type: input.notification_type ?? null,
      content_summary: input.notification_content?.slice(0, 200) ?? null,
    }),
    contributor_id: getOrCreateContributorId(),
  })
}
