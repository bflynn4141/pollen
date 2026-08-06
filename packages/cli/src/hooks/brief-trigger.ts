/**
 * SessionStart-time Pollen Brief automation:
 *  - weekly auto-send: claim the ISO week in brief_log (INSERT OR IGNORE, so
 *    concurrent sessions can't double-send) then spawn a fully detached
 *    `pollen brief --send --quiet` child. The hook never waits on it.
 *  - daily nudge: once per calendar day, surface the current top coaching
 *    card's headline as a one-line systemMessage (Claude Code only).
 *
 * HARD RULE: nothing in here may throw or block the session. Every entry
 * point is wrapped; failures degrade to "no automation this time".
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { loadConfig } from '../config.js'
import { computeCoachFindings } from '../coach-rules.js'
import { isoWeekOf } from '../brief.js'
import { claimBriefWeek, getBriefKv, setBriefKv } from '../store.js'

export interface BriefTriggerDeps {
  /** Injectable for tests — real impl spawns the detached CLI child. */
  spawnBriefSend?: () => void
  loadConfigFn?: typeof loadConfig
  now?: Date
}

function defaultSpawnBriefSend(): void {
  // Safety valve: never fire a real detached send from inside a test run.
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return
  // dist/hooks/brief-trigger.js → dist/main.js
  const mainPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'main.js')
  if (!existsSync(mainPath)) return
  const child = spawn(process.execPath, [mainPath, 'brief', '--send', '--quiet'], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

/**
 * If this ISO week has no brief yet and a recipient is configured, claim the
 * week and kick off a detached send. Returns true when a send was scheduled.
 */
export function maybeScheduleWeeklyBrief(db: Database.Database, deps: BriefTriggerDeps = {}): boolean {
  try {
    const config = (deps.loadConfigFn ?? loadConfig)()
    if (!config?.brief_email) return false
    const week = isoWeekOf(deps.now ?? new Date())
    if (!claimBriefWeek(db, week)) return false
    ;(deps.spawnBriefSend ?? defaultSpawnBriefSend)()
    return true
  } catch {
    return false
  }
}

const NUDGE_KEY = 'last_nudge_day'

/**
 * Once per calendar day, return a one-line nudge with the top coaching
 * card's headline. Returns null when already nudged today or no findings.
 */
export function maybeBuildNudge(db: Database.Database, deps: { now?: Date } = {}): string | null {
  try {
    const today = (deps.now ?? new Date()).toISOString().slice(0, 10)
    if (getBriefKv(db, NUDGE_KEY) === today) return null
    const { findings } = computeCoachFindings(db, { days: 7 })
    if (findings.length === 0) return null
    setBriefKv(db, NUDGE_KEY, today)
    return `🐝 pollen: ${findings[0].headline} — run \`pollen brief\` for details`
  } catch {
    return null
  }
}
