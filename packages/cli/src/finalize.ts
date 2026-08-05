import type Database from 'better-sqlite3'
import { computeSessionArc } from './session-arc.js'
import { updateSession } from './store.js'

// Sessions whose terminal died (kill, crash, laptop close) never receive a
// SessionEnd hook, so their arc/outcome/satisfaction stay NULL forever and
// they vanish from every outcome-based view. Mirror prompt-trends: any
// unfinished session idle longer than this window is finalized as of its
// last observed activity.
export const IDLE_FINALIZE_MS = 2 * 60 * 60 * 1000

interface StaleSession {
  session_id: string
  started_at: number
}

/**
 * Finalize sessions with no SessionEnd that have been idle > IDLE_FINALIZE_MS.
 * Runs opportunistically (session start, sync) — must never throw.
 * Returns the number of sessions finalized.
 */
export function finalizeStaleSessions(
  db: Database.Database,
  opts: { excludeSessionId?: string; now?: number } = {},
): number {
  const now = opts.now ?? Date.now()
  let finalized = 0

  try {
    const stale = db.prepare(
      'SELECT session_id, started_at FROM sessions WHERE ended_at IS NULL AND session_id != ?'
    ).all(opts.excludeSessionId ?? '') as StaleSession[]

    for (const session of stale) {
      try {
        const lastActivity = getLastActivity(db, session.session_id, session.started_at)
        if (now - lastActivity <= IDLE_FINALIZE_MS) continue

        const arc = computeSessionArc(db, session.session_id, session.started_at, lastActivity)

        const mcpRows = db.prepare(
          'SELECT DISTINCT mcp_server FROM tool_events WHERE session_id = ? AND mcp_server IS NOT NULL'
        ).all(session.session_id) as { mcp_server: string }[]
        const mcpServers = mcpRows.map(r => r.mcp_server)

        updateSession(db, {
          session_id: session.session_id,
          ended_at: lastActivity,
          end_reason: 'idle_finalized',
          mcp_servers_used: mcpServers.length > 0 ? JSON.stringify(mcpServers) : null,
          ...arc,
        })
        finalized++
      } catch {
        // one bad session must not block the rest
      }
    }
  } catch {
    // table missing / locked — finalization is best-effort by design
  }

  return finalized
}

function getLastActivity(db: Database.Database, sessionId: string, startedAt: number): number {
  const row = db.prepare(
    `SELECT MAX(ts) AS last FROM (
       SELECT MAX(timestamp) AS ts FROM contributions WHERE session_id = ?
       UNION ALL
       SELECT MAX(timestamp) AS ts FROM tool_events WHERE session_id = ?
     )`
  ).get(sessionId, sessionId) as { last: number | null }
  return Math.max(startedAt, row.last ?? 0)
}
