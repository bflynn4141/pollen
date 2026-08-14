import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectDoctorReport, renderDoctorReport } from './doctor.js'
import { installClaudeHooks } from './setup.js'
import { installCodexHooks } from './codex-setup.js'

const homes: string[] = []

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

function healthyHome(): { home: string; token: string } {
  const home = mkdtempSync(join(tmpdir(), 'pollen-doctor-'))
  homes.push(home)
  const pollenDir = join(home, '.pollen')
  mkdirSync(pollenDir, { recursive: true, mode: 0o700 })
  chmodSync(pollenDir, 0o700)
  const token = `pln_${'s'.repeat(43)}`
  const configPath = join(pollenDir, 'config.json')
  writeFileSync(configPath, JSON.stringify({
    contributor_id: 'contributor-1',
    network: {
      api_url: 'https://api.test',
      token,
      registered_at: '2026-08-13T00:00:00.000Z',
    },
  }), { mode: 0o600 })
  chmodSync(configPath, 0o600)
  writeFileSync(join(pollenDir, 'local.db'), '')
  installClaudeHooks(join(home, '.claude', 'settings.json'), 'pollen-hook')
  installCodexHooks(join(home, '.codex', 'hooks.json'), 'pollen-hook --source codex')
  return { home, token }
}

describe.each(['darwin', 'linux'] as const)('doctor on %s', platform => {
  it('passes a clean Claude Code + Codex contributor install without exposing credentials', async () => {
    const { home, token } = healthyHome()
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      contributor_id: 'contributor-1',
      status: 'active',
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    const report = await collectDoctorReport({
      home,
      platform,
      nodeVersion: '22.18.0',
      commandExists: () => true,
      fetchImpl: fetchImpl as typeof fetch,
    })
    const output = renderDoctorReport(report)

    expect(report.ok).toBe(true)
    expect(report.checks.filter(check => check.status === 'fail')).toEqual([])
    expect(output).toContain('Claude Code hooks')
    expect(output).toContain('Codex hooks')
    expect(output).not.toContain(token)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/v1/contributors/me',
      expect.objectContaining({ headers: { authorization: `Bearer ${token}` } }),
    )
  })
})

describe('doctor failures', () => {
  it('reports an invalid network token without printing it', async () => {
    const { home, token } = healthyHome()
    const report = await collectDoctorReport({
      home,
      platform: 'linux',
      nodeVersion: '22.18.0',
      commandExists: () => true,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })) as typeof fetch,
    })
    const output = renderDoctorReport(report)

    expect(report.ok).toBe(false)
    expect(report.checks).toContainEqual(expect.objectContaining({ id: 'network', status: 'fail' }))
    expect(output).not.toContain(token)
  })
})
