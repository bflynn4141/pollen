import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { POLLEN_HOOK_EVENTS } from './setup.js'
import { CODEX_HOOK_EVENTS } from './codex-setup.js'

export type DoctorStatus = 'pass' | 'warn' | 'fail'

export interface DoctorCheck {
  id: string
  label: string
  status: DoctorStatus
  detail: string
}

export interface DoctorReport {
  ok: boolean
  platform: string
  checks: DoctorCheck[]
}

interface DoctorOptions {
  home?: string
  platform?: string
  nodeVersion?: string
  commandExists?: (command: 'claude' | 'codex') => boolean
  fetchImpl?: typeof fetch
}

interface NetworkConfig {
  api_url: string
  token: string
}

function pollenHook(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false
  const record = entry as { command?: unknown; hooks?: unknown }
  if (typeof record.command === 'string') return /pollen|@pollen\//.test(record.command)
  return Array.isArray(record.hooks) && record.hooks.some(hook => {
    if (!hook || typeof hook !== 'object') return false
    const command = (hook as { command?: unknown }).command
    return typeof command === 'string' && /pollen|@pollen\//.test(command)
  })
}

function inspectHooks(path: string, required: readonly string[]): { ok: boolean; detail: string } {
  if (!existsSync(path)) return { ok: false, detail: 'not configured' }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { hooks?: Record<string, unknown> }
    const missing = required.filter(event => {
      const entries = parsed.hooks?.[event]
      return !Array.isArray(entries) || !entries.some(pollenHook)
    })
    return missing.length === 0
      ? { ok: true, detail: `${required.length}/${required.length} required events` }
      : { ok: false, detail: `${missing.length} required event${missing.length === 1 ? '' : 's'} missing` }
  } catch {
    return { ok: false, detail: 'configuration is malformed JSON' }
  }
}

function defaultCommandExists(command: 'claude' | 'codex'): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  return spawnSync(probe, [command], { stdio: 'ignore' }).status === 0
}

function mode(path: string): number | null {
  try {
    return statSync(path).mode & 0o777
  } catch {
    return null
  }
}

export async function collectDoctorReport(options: DoctorOptions = {}): Promise<DoctorReport> {
  const home = options.home ?? process.env.HOME ?? '~'
  const platform = options.platform ?? process.platform
  const nodeVersion = options.nodeVersion ?? process.versions.node
  const commandExists = options.commandExists ?? defaultCommandExists
  const fetchImpl = options.fetchImpl ?? fetch
  const checks: DoctorCheck[] = []
  const add = (id: string, label: string, status: DoctorStatus, detail: string) => {
    checks.push({ id, label, status, detail })
  }

  const nodeMajor = Number(nodeVersion.split('.')[0])
  add('runtime', 'Node.js', nodeMajor >= 20 ? 'pass' : 'fail', `v${nodeVersion} (requires 20+)`)

  const pollenDir = join(home, '.pollen')
  const configPath = join(pollenDir, 'config.json')
  const databasePath = join(pollenDir, 'local.db')
  let network: NetworkConfig | null = null
  if (!existsSync(configPath)) {
    add('config', 'Contributor config', 'fail', 'missing; run pollen join <invite-code>')
  } else {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as { network?: Partial<NetworkConfig> }
      if (
        typeof config.network?.api_url !== 'string'
        || typeof config.network?.token !== 'string'
        || !/^pln_[A-Za-z0-9_-]{43}$/.test(config.network.token)
      ) {
        add('config', 'Contributor config', 'fail', 'network registration is incomplete')
      } else {
        network = config.network as NetworkConfig
        add('config', 'Contributor config', 'pass', 'network registration found')
      }
    } catch {
      add('config', 'Contributor config', 'fail', 'malformed JSON')
    }
  }

  const configMode = mode(configPath)
  const dirMode = mode(pollenDir)
  const privatePermissions = configMode === 0o600 && dirMode === 0o700
  add(
    'permissions',
    'Local permissions',
    privatePermissions ? 'pass' : 'warn',
    privatePermissions ? 'config 0600 · directory 0700' : 'expected config 0600 and directory 0700',
  )
  add('database', 'Local database', existsSync(databasePath) ? 'pass' : 'warn', existsSync(databasePath) ? 'present' : 'created after first captured event')

  for (const agent of ['claude', 'codex'] as const) {
    const installed = commandExists(agent)
    const label = agent === 'claude' ? 'Claude Code hooks' : 'Codex hooks'
    if (!installed) {
      add(agent, label, 'warn', 'agent CLI not installed')
      continue
    }
    const result = agent === 'claude'
      ? inspectHooks(join(home, '.claude', 'settings.json'), POLLEN_HOOK_EVENTS)
      : inspectHooks(join(home, '.codex', 'hooks.json'), CODEX_HOOK_EVENTS)
    add(agent, label, result.ok ? 'pass' : 'fail', result.detail)
  }

  if (network) {
    try {
      const response = await fetchImpl(`${network.api_url.replace(/\/$/, '')}/api/v1/contributors/me`, {
        headers: { authorization: `Bearer ${network.token}` },
        cache: 'no-store',
      })
      add('network', 'Network token', response.ok ? 'pass' : 'fail', response.ok ? 'active' : `rejected (HTTP ${response.status})`)
    } catch {
      add('network', 'Network token', 'fail', 'API unreachable')
    }
  }

  return { ok: !checks.some(check => check.status === 'fail'), platform, checks }
}

export function renderDoctorReport(report: DoctorReport): string {
  const icon: Record<DoctorStatus, string> = { pass: '✓', warn: '!', fail: '✗' }
  return [
    `Pollen doctor · ${report.platform}`,
    '',
    ...report.checks.map(check => `${icon[check.status]} ${check.label}: ${check.detail}`),
    '',
    report.ok ? 'Ready to contribute.' : 'Fix failed checks, then run pollen doctor again.',
  ].join('\n')
}

export async function runDoctor(): Promise<boolean> {
  const report = await collectDoctorReport()
  console.log(renderDoctorReport(report))
  return report.ok
}
