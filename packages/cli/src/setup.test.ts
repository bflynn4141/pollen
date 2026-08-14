import { PassThrough, Writable } from 'node:stream'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installClaudeHooks, makePollenHookEntry, POLLEN_HOOK_EVENTS, runSetup } from './setup.js'

describe('setup', () => {
  it('uses the executable installed by the CLI package for hooks', () => {
    expect(makePollenHookEntry().hooks[0].command).toBe('pollen-hook')
  })

  it('creates a clean Claude Code install with every required hook', () => {
    const home = mkdtempSync(join(tmpdir(), 'pollen-claude-install-'))
    const settingsPath = join(home, '.claude', 'settings.json')
    try {
      const result = installClaudeHooks(settingsPath, 'pollen-hook')
      const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))

      expect(result.added).toEqual([...POLLEN_HOOK_EVENTS])
      for (const event of POLLEN_HOOK_EVENTS) {
        expect(settings.hooks[event][0].hooks[0].command).toBe('pollen-hook')
      }
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('completes the clean-user demo flow using one input stream', async () => {
    const answers = [
      '\n',
      '2\n',
      '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18\n',
      'n\n',
    ]
    const input = new PassThrough()
    let output = ''
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString()
        const answer = answers.shift()
        if (answer) setImmediate(() => input.write(answer))
        callback()
      },
    })

    await runSetup(true, { input, output: sink })
    input.end()

    expect(output).toContain('Install hooks?')
    expect(output).toContain('Choice [1]:')
    expect(output).toContain('Verify now?')
  })
})
