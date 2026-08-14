import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openLocalDb } from './local-db.js'

describe('openLocalDb', () => {
  const temporaryDirectories: string[] = []

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('creates the pollen directory and database for a clean user', () => {
    const home = mkdtempSync(join(tmpdir(), 'pollen-clean-home-'))
    temporaryDirectories.push(home)
    const databasePath = join(home, '.pollen', 'local.db')

    const db = openLocalDb(databasePath)
    db.close()

    expect(existsSync(databasePath)).toBe(true)
    expect(statSync(join(home, '.pollen')).mode & 0o777).toBe(0o700)
    expect(statSync(databasePath).mode & 0o777).toBe(0o600)
  })

  it('repairs permissions on an existing local database', () => {
    const home = mkdtempSync(join(tmpdir(), 'pollen-existing-home-'))
    temporaryDirectories.push(home)
    const databasePath = join(home, '.pollen', 'local.db')

    const first = openLocalDb(databasePath)
    first.close()
    chmodSync(join(home, '.pollen'), 0o755)
    chmodSync(databasePath, 0o644)

    const reopened = openLocalDb(databasePath)
    reopened.close()

    expect(statSync(join(home, '.pollen')).mode & 0o777).toBe(0o700)
    expect(statSync(databasePath).mode & 0o777).toBe(0o600)
  })
})
