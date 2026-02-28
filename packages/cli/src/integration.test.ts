import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { extractFeatures } from './features.js'
import { classify } from './classify.js'
import { coarsenDepth } from './session.js'
import { initDb, insertContribution, getSessionPromptCount, queryIntentDistribution, queryLanguageDistribution, getStats } from './store.js'
import type { TermDictionary } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const terms: TermDictionary = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'terms.json'), 'utf-8'))

function pipeline(prompt: string, sessionId: string, db: ReturnType<typeof initDb>) {
  const now = new Date()
  const features = extractFeatures(prompt, terms, now)

  const count = getSessionPromptCount(db, sessionId)
  features.session_depth = coarsenDepth(count + 1)

  const labels = classify(features, terms)

  insertContribution(db, {
    id: randomUUID(),
    timestamp: now.getTime(),
    session_id: sessionId,
    features,
    labels,
    action: null,
    topic: null,
  })

  return labels
}

describe('integration: full pipeline', () => {
  let db: ReturnType<typeof initDb>

  beforeEach(() => {
    db = initDb()
  })

  afterEach(() => {
    db.close()
  })

  const testCases: Array<{ prompt: string; expectedIntent: string }> = [
    { prompt: 'TypeError: Cannot read property "foo" of undefined\n    at Object.<anonymous> (/app/index.js:10:5)', expectedIntent: 'debugging' },
    { prompt: 'add a new search component to the dashboard page', expectedIntent: 'feature_build' },
    { prompt: 'refactor the authentication module to use middleware', expectedIntent: 'refactoring' },
    { prompt: 'how does the React context API work?', expectedIntent: 'learning' },
    { prompt: 'deploy this to production using docker compose', expectedIntent: 'devops' },
    { prompt: 'write unit tests for the validation module', expectedIntent: 'testing' },
    { prompt: 'update the readme and changelog with the latest changes', expectedIntent: 'documentation' },
    { prompt: 'review this pull request and check for issues', expectedIntent: 'code_review' },
    { prompt: 'look through the codebase and figure out the structure', expectedIntent: 'exploration' },
  ]

  it('classifies all 9 intent categories correctly', () => {
    const session = 'integration-test'

    for (const { prompt, expectedIntent } of testCases) {
      const labels = pipeline(prompt, session, db)
      expect(labels.intent, `"${prompt}" should be ${expectedIntent}`).toBe(expectedIntent)
    }
  })

  it('stores all contributions and queries correctly', () => {
    const session = 'integration-test'

    for (const { prompt } of testCases) {
      pipeline(prompt, session, db)
    }

    // Verify stats
    const stats = getStats(db)
    expect(stats.total).toBe(9)
    expect(stats.uniqueSessions).toBe(1)

    // Verify intent distribution
    const intents = queryIntentDistribution(db)
    expect(intents).toHaveLength(9)
    expect(intents.every(r => r.count === 1)).toBe(true)
  })

  it('tracks session depth across prompts in same session', () => {
    const session = 'depth-test'

    for (let i = 0; i < 20; i++) {
      pipeline(`prompt number ${i}`, session, db)
    }

    const rows = db.prepare('SELECT session_depth FROM contributions WHERE session_id = ? ORDER BY timestamp').all(session) as { session_depth: string }[]

    expect(rows[0].session_depth).toBe('first')    // prompt 1
    expect(rows[1].session_depth).toBe('early')     // prompt 2
    expect(rows[4].session_depth).toBe('early')     // prompt 5
    expect(rows[5].session_depth).toBe('mid')       // prompt 6
    expect(rows[14].session_depth).toBe('mid')      // prompt 15
    expect(rows[15].session_depth).toBe('deep')     // prompt 16
  })

  it('detects languages from prompts', () => {
    pipeline('update the tsconfig and fix the typescript error', 'lang-test', db)
    pipeline('create a new python module with pip install', 'lang-test', db)

    const langs = queryLanguageDistribution(db)
    const langNames = langs.map(l => l.language)
    expect(langNames).toContain('typescript')
    expect(langNames).toContain('python')
  })
})
