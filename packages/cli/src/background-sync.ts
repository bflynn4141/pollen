import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadConfig, type PollenConfig } from './config.js'

interface DetachedProcess {
  unref(): void
}

type SpawnDetached = (
  command: string,
  args: string[],
  options: { detached: boolean; stdio: 'ignore' },
) => DetachedProcess

interface BackgroundSyncOptions {
  registration?: PollenConfig['network'] | null
  spawnImpl?: SpawnDetached
  execPath?: string
  workerPath?: string
}

/**
 * Launch a best-effort detached delivery worker. Credentials stay in the
 * mode-0600 config file and are never copied into argv or child environment.
 */
export function launchBackgroundNetworkSync(
  options: BackgroundSyncOptions = {},
): boolean {
  const registration = Object.prototype.hasOwnProperty.call(options, 'registration')
    ? options.registration
    : loadConfig()?.network
  if (!registration) return false
  const spawnImpl = options.spawnImpl ?? (spawn as unknown as SpawnDetached)
  const workerPath = options.workerPath ?? fileURLToPath(new URL('./main.js', import.meta.url))
  try {
    const child = spawnImpl(
      options.execPath ?? process.execPath,
      [workerPath, '_sync-network-outbox'],
      { detached: true, stdio: 'ignore' },
    )
    child.unref()
    return true
  } catch {
    return false
  }
}
