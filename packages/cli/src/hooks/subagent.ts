import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { getOrCreateContributorId } from '../config.js'
import { insertLifecycleEvent } from '../store.js'
import type { HookInput } from '../types.js'

export function handleSubagentStart(db: Database.Database, input: HookInput): void {
  if (!input.session_id) return

  insertLifecycleEvent(db, {
    id: randomUUID(),
    session_id: input.session_id,
    timestamp: Date.now(),
    event_type: 'subagent_start',
    metadata: JSON.stringify({
      agent_name: input.agent_name ?? null,
      agent_type: input.agent_type ?? null,
      task_description: input.task_description ?? null,
    }),
    contributor_id: getOrCreateContributorId(),
  })
}

export function handleSubagentStop(db: Database.Database, input: HookInput): void {
  if (!input.session_id) return

  insertLifecycleEvent(db, {
    id: randomUUID(),
    session_id: input.session_id,
    timestamp: Date.now(),
    event_type: 'subagent_stop',
    metadata: JSON.stringify({
      agent_name: input.agent_name ?? null,
      agent_type: input.agent_type ?? null,
    }),
    contributor_id: getOrCreateContributorId(),
  })
}
