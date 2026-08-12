import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { initDb } from './store.js'

/** Open Pollen's local database, creating its private parent directory first. */
export function openLocalDb(databasePath: string): ReturnType<typeof initDb> {
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 })
  return initDb(databasePath)
}
