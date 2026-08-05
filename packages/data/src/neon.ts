import { neon } from '@neondatabase/serverless'

let databaseUrl: string | undefined

/**
 * Inject the Neon connection string explicitly. Cloudflare Workers receive
 * secrets as env bindings rather than process.env — call this at the top of
 * fetch()/scheduled() with env.NEON_DATABASE_URL. Next.js callers can skip
 * it; getDb() falls back to process.env.NEON_DATABASE_URL.
 */
export function configureDb(url: string) {
  databaseUrl = url
}

export function getDb() {
  // globalThis lookup so this file typechecks in both Node (site, scripts)
  // and Cloudflare Workers (no `process` global in workers-types).
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  const url = databaseUrl ?? proc?.env?.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL not set (call configureDb(url) or set the env var)')
  return neon(url)
}
