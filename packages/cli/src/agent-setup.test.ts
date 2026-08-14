import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installDetectedAgentHooks } from './agent-setup.js'

describe.each(['darwin', 'linux'] as const)('clean contributor setup on %s', platform => {
  it('installs both detected agent integrations without wallet or identity setup', () => {
    const home = mkdtempSync(join(tmpdir(), 'pollen-agent-setup-'))
    mkdirSync(home, { recursive: true })
    try {
      const result = installDetectedAgentHooks({
        home,
        platform,
        commandExists: () => true,
        claudeCommand: 'pollen-hook',
        codexCommand: 'pollen-hook --source codex',
      })

      expect(result.errors).toEqual([])
      expect(result.installed).toEqual(['Claude Code', 'Codex'])
      expect(JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).hooks).toBeTruthy()
      expect(JSON.parse(readFileSync(join(home, '.codex', 'hooks.json'), 'utf8')).hooks).toBeTruthy()
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
