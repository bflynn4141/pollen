export type McpLatencyBucket = 'instant' | 'fast' | 'moderate' | 'slow' | 'very_slow' | 'unknown'

export interface PublicMcpIdentity {
  server: string
  tool: string
}

// Public integrations whose names are safe to contribute. Unknown aliases may
// contain customer, repository, or internal service names, so they are grouped
// instead of transmitted verbatim.
const PUBLIC_SERVERS = new Set([
  'airtable', 'apollo', 'asana', 'aws', 'box', 'brave-search', 'canva',
  'cloudflare', 'docker', 'figma', 'filesystem', 'github', 'gmail',
  'google-calendar', 'google-drive', 'hubspot', 'kubernetes', 'linear',
  'memory', 'microsoft-teams', 'neon', 'notion', 'playwright', 'postgres',
  'posthog', 'puppeteer', 'replit', 'semrush', 'sentry', 'sequential-thinking',
  'slack', 'stripe', 'supabase', 'vercel', 'zotero',
])

const SERVER_ALIASES: Record<string, string> = {
  'github-mcp': 'github',
  'github-official': 'github',
  'google_drive': 'google-drive',
  gdrive: 'google-drive',
  'google_calendar': 'google-calendar',
  gcal: 'google-calendar',
  teams: 'microsoft-teams',
  'ms-teams': 'microsoft-teams',
  neon_postgres: 'neon',
  'neon-postgres': 'neon',
  postgres_mcp: 'postgres',
  'postgres-mcp': 'postgres',
  brave: 'brave-search',
  sequential_thinking: 'sequential-thinking',
}

function slug(value: string, max: number): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .slice(0, max)
}

export function canonicalizeMcpIdentity(serverName: string, toolName: string): PublicMcpIdentity {
  const normalizedServer = slug(serverName, 48).replaceAll('_', '-')
  const server = SERVER_ALIASES[normalizedServer] ?? normalizedServer
  if (!PUBLIC_SERVERS.has(server)) return { server: 'private', tool: 'private' }

  const rawTool = toolName.startsWith(`mcp__${serverName}__`)
    ? toolName.slice(`mcp__${serverName}__`.length)
    : toolName.split('__').at(-1) ?? toolName
  const tool = slug(rawTool, 64)
  return { server, tool: tool || 'unknown' }
}

export function latencyBucket(durationMs: number | null): McpLatencyBucket {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return 'unknown'
  if (durationMs < 250) return 'instant'
  if (durationMs < 1_000) return 'fast'
  if (durationMs < 5_000) return 'moderate'
  if (durationMs < 30_000) return 'slow'
  return 'very_slow'
}
