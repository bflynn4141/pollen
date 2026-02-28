import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFeatures } from './features.js'
import { classify } from './classify.js'
import { coarsenDepth } from './session.js'
import { initDb, insertContribution, getSessionPromptCount } from './store.js'
import type { TermDictionary } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const terms: TermDictionary = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'terms.json'), 'utf-8'))

// Test the pipeline logic directly (not stdin/stdout)
function runPipeline(prompt: string, sessionId: string, db: ReturnType<typeof initDb>) {
  const now = new Date()
  const features = extractFeatures(prompt, terms, now)

  const count = getSessionPromptCount(db, sessionId)
  features.session_depth = coarsenDepth(count + 1)

  const labels = classify(features, terms)
  const id = randomUUID()

  insertContribution(db, {
    id,
    timestamp: now.getTime(),
    session_id: sessionId,
    features,
    labels,
    action: null,
    topic: null,
  })

  return { id, features, labels }
}

describe('hook pipeline', () => {
  let db: ReturnType<typeof initDb>

  beforeEach(() => {
    db = initDb() // in-memory
  })

  afterEach(() => {
    db.close()
  })

  it('classifies a debugging prompt correctly', () => {
    const { labels } = runPipeline(
      'I get a TypeError: Cannot read property "length" of undefined',
      'session-1',
      db,
    )
    expect(labels.intent).toBe('debugging')
    expect(labels.confidence).toBe(0.9)
  })

  it('classifies a feature build prompt correctly', () => {
    const { labels } = runPipeline(
      'add a login button to the header component',
      'session-1',
      db,
    )
    expect(labels.intent).toBe('feature_build')
  })

  it('tracks session depth across multiple prompts', () => {
    const r1 = runPipeline('first prompt', 'session-x', db)
    const r2 = runPipeline('second prompt', 'session-x', db)
    const r3 = runPipeline('third prompt', 'session-x', db)

    expect(r1.features.session_depth).toBe('first')
    expect(r2.features.session_depth).toBe('early')
    expect(r3.features.session_depth).toBe('early')
  })

  it('stores contribution in database', () => {
    runPipeline('fix the broken test', 'session-1', db)

    const row = db.prepare('SELECT COUNT(*) as count FROM contributions').get() as { count: number }
    expect(row.count).toBe(1)
  })

  it('handles empty prompt without error', () => {
    const features = extractFeatures('', terms, new Date())
    const labels = classify(features, terms)
    expect(labels.intent).toBe('exploration')
  })
})
