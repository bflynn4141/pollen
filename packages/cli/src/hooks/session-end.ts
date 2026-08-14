import type Database from 'better-sqlite3'
import { getSession, updateSession } from '../store.js'
import { computeSessionArc } from '../session-arc.js'
import { enqueueEligibleNetworkReceipts } from '../network-outbox.js'
import type { HookInput } from '../types.js'

export function handleSessionEnd(db: Database.Database, input: HookInput): void {
  if (!input.session_id) return

  const session = getSession(db, input.session_id)
  if (!session) return // no matching SessionStart recorded

  const endedAt = Date.now()
  const arc = computeSessionArc(db, input.session_id, session.started_at, endedAt)

  // Gather unique MCP servers used in this session
  const mcpRows = db.prepare(
    'SELECT DISTINCT mcp_server FROM tool_events WHERE session_id = ? AND mcp_server IS NOT NULL'
  ).all(input.session_id) as { mcp_server: string }[]
  const mcpServers = mcpRows.map(r => r.mcp_server)

  updateSession(db, {
    session_id: input.session_id,
    ended_at: endedAt,
    end_reason: input.reason ?? null,
    mcp_servers_used: mcpServers.length > 0 ? JSON.stringify(mcpServers) : null,
    ...arc,
  })

  // Durable-before-delivery: the hook records work locally before a detached
  // worker attempts any network request.
  enqueueEligibleNetworkReceipts(db)
}
