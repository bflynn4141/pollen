import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { installClaudeHooks } from './setup.js'
import { installCodexHooks } from './codex-setup.js'

interface AgentSetupOptions {
  home?: string
  platform?: string
  commandExists?: (command: 'claude' | 'codex') => boolean
  claudeCommand?: string
  codexCommand?: string
}

export interface AgentSetupResult {
  installed: string[]
  skipped: string[]
  errors: string[]
}

function hasCommand(command: 'claude' | 'codex', platform: string): boolean {
  return spawnSync(platform === 'win32' ? 'where' : 'which', [command], { stdio: 'ignore' }).status === 0
}

/** Install capture hooks only; wallets and identity are intentionally separate. */
export function installDetectedAgentHooks(options: AgentSetupOptions = {}): AgentSetupResult {
  const home = options.home ?? process.env.HOME ?? '~'
  const platform = options.platform ?? process.platform
  const commandExists = options.commandExists ?? (command => hasCommand(command, platform))
  const result: AgentSetupResult = { installed: [], skipped: [], errors: [] }

  if (commandExists('claude')) {
    const install = installClaudeHooks(
      join(home, '.claude', 'settings.json'),
      options.claudeCommand,
    )
    if (install.error) result.errors.push(`Claude Code: ${install.error}`)
    else result.installed.push('Claude Code')
  } else {
    result.skipped.push('Claude Code (not installed)')
  }

  if (commandExists('codex')) {
    const install = installCodexHooks(
      join(home, '.codex', 'hooks.json'),
      options.codexCommand,
    )
    if (install.error) result.errors.push(`Codex: ${install.error}`)
    else result.installed.push('Codex')
  } else {
    result.skipped.push('Codex (not installed)')
  }

  return result
}

export function runAgentSetup(): boolean {
  const result = installDetectedAgentHooks()
  console.log('Pollen agent setup')
  console.log('')
  for (const agent of result.installed) console.log(`✓ ${agent} hooks ready`)
  for (const agent of result.skipped) console.log(`! ${agent}`)
  for (const error of result.errors) console.log(`✗ ${error}`)
  console.log('')
  console.log('Next: pollen doctor')
  return result.installed.length > 0 && result.errors.length === 0
}
