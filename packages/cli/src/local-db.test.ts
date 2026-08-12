import { existsSync, mkdtempSync, rmSync } from 'node:fs'
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
  })
})
