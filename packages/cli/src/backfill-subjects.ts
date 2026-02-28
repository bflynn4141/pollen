import type Database from 'better-sqlite3'
import { extractSubject } from './extract-subject.js'
import { updateSession } from './store.js'

interface SessionRow {
  session_id: string
  dominant_intent: string | null
  dominant_domain: string | null
}

interface ContributionRow {
  keywords: string
  frameworks: string
  language_signals: string
  domain: string | null
  intent: string | null
  topic: string | null
  action: string | null
}

function reconstructPrompt(c: ContributionRow): string {
  const parts: string[] = []

  const frameworks = safeParseArray(c.frameworks)
  const keywords = safeParseArray(c.keywords)
  const languages = safeParseArray(c.language_signals)

  if (frameworks.length) parts.push(`Using ${frameworks.join(', ')}`)
  if (keywords.length) parts.push(`working on ${keywords.slice(0, 5).join(', ')}`)
  if (c.domain) parts.push(`in ${c.domain} domain`)
  if (c.action && c.topic) parts.push(`trying to ${c.action} ${c.topic}`)
  else if (c.topic) parts.push(`focused on ${c.topic}`)
  else if (c.action) parts.push(`intent: ${c.action}`)
  if (languages.length) parts.push(`with ${languages.join(', ')}`)

  return parts.length > 0
    ? `Session: ${parts.join('. ')}.`
    : 'General coding session.'
}

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function backfillSubjects(db: Database.Database): Promise<{ total: number; filled: number; skipped: number }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set — cannot extract subjects')
    return { total: 0, filled: 0, skipped: 0 }
  }

  // Find sessions without subjects
  const sessions = db.prepare(
    'SELECT session_id, dominant_intent, dominant_domain FROM sessions WHERE subject IS NULL'
  ).all() as SessionRow[]

  console.log(`Found ${sessions.length} sessions without subjects`)

  let filled = 0
  let skipped = 0

  for (const session of sessions) {
    // Find the first contribution for this session (earliest timestamp)
    const firstContrib = db.prepare(
      'SELECT keywords, frameworks, language_signals, domain, intent, topic, action FROM contributions WHERE session_id = ? ORDER BY timestamp ASC LIMIT 1'
    ).get(session.session_id) as ContributionRow | undefined

    if (!firstContrib) {
      skipped++
      continue
    }

    const prompt = reconstructPrompt(firstContrib)

    try {
      const subject = await extractSubject(prompt)
      if (subject) {
        updateSession(db, { session_id: session.session_id, subject })
        console.log(`  ✓ ${session.session_id.slice(0, 8)}… → "${subject}"`)
        filled++
      } else {
        skipped++
      }
    } catch (err) {
      console.error(`  ✗ ${session.session_id.slice(0, 8)}… error:`, err)
      skipped++
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return { total: sessions.length, filled, skipped }
}
