import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installCodexHooks, CODEX_HOOK_EVENTS } from './codex-setup.js'

const CMD = 'node /path/to/pollen/dist/hook.js --source codex'

describe('installCodexHooks', () => {
  let dir: string
  let hooksPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pollen-codex-setup-'))
    hooksPath = join(dir, '.codex', 'hooks.json')
    mkdirSync(join(dir, '.codex'), { recursive: true })
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('creates hooks.json from scratch with all Codex events', () => {
    const result = installCodexHooks(hooksPath, CMD)

    expect(result.error).toBeUndefined()
    expect(result.added).toEqual([...CODEX_HOOK_EVENTS])
    expect(existsSync(hooksPath)).toBe(true)

    const written = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    for (const event of CODEX_HOOK_EVENTS) {
      expect(written.hooks[event]).toHaveLength(1)
      expect(written.hooks[event][0].hooks[0].command).toBe(CMD)
      expect(written.hooks[event][0].hooks[0].timeout).toBe(10)
    }
    // Codex has no PostToolUseFailure or Notification — must not register them
    expect(written.hooks.PostToolUseFailure).toBeUndefined()
    expect(written.hooks.Notification).toBeUndefined()
  })

  it('uses absolute runtime paths when no hook command override is provided', () => {
    installCodexHooks(hooksPath)

    const written = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    const command = written.hooks.UserPromptSubmit[0].hooks[0].command as string
    expect(command).toContain(process.execPath)
    expect(command).toMatch(/hook\.js"? --source codex$/)
    expect(command).not.toBe('pollen-hook --source codex')
  })

  it('preserves existing non-pollen hooks (matches real hooks.json shape)', () => {
    // Shape taken from ~/.codex/hooks.json.backup-20260504-200804
    const existing = {
      hooks: {
        PostToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: '~/.glorp/hooks/capture-context.sh', timeout: 2 }],
          },
        ],
        SessionStart: [
          {
            hooks: [{ type: 'command', command: '~/.auto/hooks/session-briefing.sh', timeout: 5 }],
          },
        ],
      },
    }
    mkdirSync(join(dir, '.codex'), { recursive: true })
    writeFileSync(hooksPath, JSON.stringify(existing, null, 2))

    const result = installCodexHooks(hooksPath, CMD)
    expect(result.added).toEqual([...CODEX_HOOK_EVENTS])

    const written = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    // glorp + auto hooks still there
    expect(written.hooks.PostToolUse[0].hooks[0].command).toContain('glorp')
    expect(written.hooks.SessionStart[0].hooks[0].command).toContain('session-briefing')
    // pollen appended after them
    expect(written.hooks.PostToolUse[1].hooks[0].command).toBe(CMD)
    expect(written.hooks.SessionStart[1].hooks[0].command).toBe(CMD)
  })

  it('is idempotent — re-run adds nothing', () => {
    installCodexHooks(hooksPath, CMD)
    const before = readFileSync(hooksPath, 'utf-8')

    const second = installCodexHooks(hooksPath, CMD)
    expect(second.added).toEqual([])
    expect(second.alreadyInstalled).toEqual([...CODEX_HOOK_EVENTS])
    expect(readFileSync(hooksPath, 'utf-8')).toBe(before)
  })

  it('fills only missing events when pollen is partially installed', () => {
    writeFileSync(hooksPath, JSON.stringify({
      hooks: {
        PostToolUse: [
          { hooks: [{ type: 'command', command: 'npx @anthropic/pollen-hook --source codex', timeout: 10 }] },
        ],
      },
    }))

    const result = installCodexHooks(hooksPath, CMD)
    expect(result.alreadyInstalled).toEqual(['PostToolUse'])
    expect(result.added).toEqual(CODEX_HOOK_EVENTS.filter(e => e !== 'PostToolUse'))

    const written = JSON.parse(readFileSync(hooksPath, 'utf-8'))
    expect(written.hooks.PostToolUse).toHaveLength(1) // not duplicated
  })

  it('refuses to touch malformed JSON', () => {
    writeFileSync(hooksPath, '{ not json !!!')
    const result = installCodexHooks(hooksPath, CMD)
    expect(result.error).toBeTruthy()
    expect(result.added).toEqual([])
    expect(readFileSync(hooksPath, 'utf-8')).toBe('{ not json !!!')
  })
})
