/**
 * `pollen setup --codex` — install pollen hooks into ~/.codex/hooks.json.
 *
 * Codex clones Claude Code's hook config format (verified against the local
 * ~/.codex/hooks.json backup): { hooks: { EventName: [{ matcher?, hooks:
 * [{ type: 'command', command, timeout }] }] } }.
 *
 * Merge-safe: creates the file if missing, never removes other hooks,
 * idempotent on re-run (mirrors setup.ts's settings.json handling).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOME = process.env.HOME ?? '~'
export const CODEX_HOOKS_PATH = join(HOME, '.codex', 'hooks.json')

// Codex's hook event vocabulary — cloned from Claude Code, minus
// PostToolUseFailure and Notification (Codex has neither).
export const CODEX_HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'PermissionRequest',
] as const

// The --source codex flag is how dist/hook.js knows to tag sessions
// source='codex' and route errored PostToolUse payloads to the failure path.
const DEFAULT_CODEX_HOOK_COMMAND = [
  JSON.stringify(process.execPath),
  JSON.stringify(fileURLToPath(new URL('./hook.js', import.meta.url))),
  '--source codex',
].join(' ')

function makeCodexHookEntry(command: string) {
  return {
    matcher: '',
    hooks: [
      {
        type: 'command' as const,
        command,
        timeout: 10,
      },
    ],
  }
}

/** Detect whether a hook entry is a pollen hook (any format) — same logic as setup.ts */
function isPollenHook(entry: any): boolean {
  if (entry?.hooks && Array.isArray(entry.hooks)) {
    return entry.hooks.some((h: any) =>
      typeof h.command === 'string' &&
      (h.command.includes('pollen') || h.command.includes('@pollen/'))
    )
  }
  if (typeof entry?.command === 'string') {
    return entry.command.includes('pollen') || entry.command.includes('@pollen/')
  }
  return false
}

export interface CodexInstallResult {
  added: string[]        // events a pollen hook was added to
  alreadyInstalled: string[]
  error?: string         // set when the file was malformed and left untouched
}

/**
 * Merge pollen hook entries into a Codex hooks.json file.
 * Pure file operation — no prompts — so it is directly testable.
 */
export function installCodexHooks(
  hooksPath: string = CODEX_HOOKS_PATH,
  command: string = process.env.POLLEN_HOOK_COMMAND ?? DEFAULT_CODEX_HOOK_COMMAND,
): CodexInstallResult {
  let settings: any = {}

  if (existsSync(hooksPath)) {
    const raw = readFileSync(hooksPath, 'utf-8')
    try {
      settings = JSON.parse(raw)
    } catch {
      return {
        added: [],
        alreadyInstalled: [],
        error: `${hooksPath} exists but is malformed JSON — left untouched. Fix it and re-run.`,
      }
    }
  }

  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {}
  }

  const added: string[] = []
  const alreadyInstalled: string[] = []

  for (const event of CODEX_HOOK_EVENTS) {
    const entries = settings.hooks[event]
    if (Array.isArray(entries) && entries.some(isPollenHook)) {
      alreadyInstalled.push(event)
      continue
    }
    if (!Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = []
    }
    settings.hooks[event].push(makeCodexHookEntry(command))
    added.push(event)
  }

  if (added.length > 0) {
    const dir = dirname(hooksPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(hooksPath, JSON.stringify(settings, null, 2) + '\n')
  }

  return { added, alreadyInstalled }
}

/** CLI entry for `pollen setup --codex` */
export async function runCodexSetup(): Promise<void> {
  console.log('')
  console.log('  pollen setup --codex — install hooks into ~/.codex/hooks.json')
  console.log('')

  const result = installCodexHooks()

  if (result.error) {
    console.log(`  ⚠  ${result.error}`)
    return
  }

  if (result.added.length === 0) {
    console.log('  ✓ Codex hooks already installed')
  } else {
    console.log(`  ✓ Added pollen hook to ${result.added.length} event${result.added.length > 1 ? 's' : ''}:`)
    for (const event of result.added) {
      console.log(`    + ${event}`)
    }
    if (result.alreadyInstalled.length > 0) {
      console.log(`  (already present on: ${result.alreadyInstalled.join(', ')})`)
    }
  }

  console.log('')
  console.log('  Existing hooks were preserved. Codex sessions will be tagged source=codex.')
  console.log('  Historical sessions: pollen backfill --codex [--days N]')
  console.log('')
}
