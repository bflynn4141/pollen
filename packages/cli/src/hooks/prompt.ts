import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { extractFeatures } from '../features.js'
import { classify } from '../classify.js'
import { extractAction, extractTopic } from '../coarsen.js'
import { coarsenDepth } from '../session.js'
import { insertContribution, getSessionPromptCount, updateSession } from '../store.js'
import { extractSubject } from '../extract-subject.js'
import type { HookInput, TermDictionary } from '../types.js'

let _terms: TermDictionary | null = null

function loadTerms(): TermDictionary {
  if (_terms) return _terms
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const termsPath = join(__dirname, '..', '..', 'data', 'terms.json')
  _terms = JSON.parse(readFileSync(termsPath, 'utf-8'))
  return _terms!
}

/**
 * Returns a pending Promise if async subject extraction was kicked off,
 * or null if no async work is needed. The caller must await this promise
 * before closing the DB.
 */
export function handlePromptSubmit(db: Database.Database, input: HookInput): Promise<void> | null {
  const text = input.prompt ?? ''
  if (!text.trim()) return null

  const terms = loadTerms()
  const now = new Date()
  const features = extractFeatures(text, terms, now)

  let isFirstPrompt = false
  if (input.session_id) {
    const count = getSessionPromptCount(db, input.session_id)
    features.session_depth = coarsenDepth(count + 1)
    isFirstPrompt = count === 0
  }

  const labels = classify(features, terms)

  insertContribution(db, {
    id: randomUUID(),
    timestamp: now.getTime(),
    session_id: input.session_id,
    features,
    labels,
    action: extractAction(text),
    topic: extractTopic(text),
  })

  // Fire-and-forget subject extraction on first prompt of a session
  if (isFirstPrompt && input.session_id) {
    const sessionId = input.session_id
    return extractSubject(text).then(subject => {
      if (subject) {
        updateSession(db, { session_id: sessionId, subject })
      }
    }).catch(() => {
      // Never fail — subject extraction is best-effort
    })
  }

  return null
}
