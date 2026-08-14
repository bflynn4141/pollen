import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { initDb } from './store.js'

/** Open Pollen's local database, creating its private parent directory first. */
export function openLocalDb(databasePath: string): ReturnType<typeof initDb> {
  const directory = dirname(databasePath)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const db = initDb(databasePath)
  chmodSync(databasePath, 0o600)
  return db
}
