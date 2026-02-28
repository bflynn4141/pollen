import { neon } from '@neondatabase/serverless'

export function getDb() {
  const url = process.env.NEON_DATABASE_URL
  if (!url) throw new Error('NEON_DATABASE_URL not set')
  return neon(url)
}
