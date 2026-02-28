import { describe, expect, it } from 'vitest'
import terms from '../data/terms.json'
import type { RawFeatures, TermDictionary } from './types.js'
import { classify, classifyComplexity, classifyDomain, classifyIntent, classifyPromptStyle } from './classify.js'

const t = terms as TermDictionary

function makeFeatures(overrides: Partial<RawFeatures> = {}): RawFeatures {
  return {
    keywords: [],
    tools_chain: [],
    language_signals: [],
    frameworks: [],
    prompt_length: 'medium',
    code_ratio: 'none',
    structure_type: 'conversation',
    session_depth: 'first',
    has_error_trace: false,
    has_code_block: false,
    day_of_week: 'monday',
    hour_bucket: 'morning',
    ...overrides,
  }
}

describe('classifyIntent', () => {
  it('classifies debugging from error trace', () => {
    const f = makeFeatures({ has_error_trace: true })
    expect(classifyIntent(f, t).intent).toBe('debugging')
  })

  it('classifies debugging from error keywords', () => {
    const f = makeFeatures({ keywords: ['typeerror'] })
    expect(classifyIntent(f, t).intent).toBe('debugging')
  })

  it('classifies feature_build from imperative + build keywords', () => {
    const f = makeFeatures({ structure_type: 'imperative', keywords: ['create'] })
    expect(classifyIntent(f, t).intent).toBe('feature_build')
  })

  it('classifies refactoring', () => {
    const f = makeFeatures({ keywords: ['refactor'] })
    expect(classifyIntent(f, t).intent).toBe('refactoring')
  })

  it('classifies learning from questions', () => {
    const f = makeFeatures({ structure_type: 'question', keywords: ['how'] })
    expect(classifyIntent(f, t).intent).toBe('learning')
  })

  it('classifies devops', () => {
    const f = makeFeatures({ keywords: ['deploy'] })
    expect(classifyIntent(f, t).intent).toBe('devops')
  })

  it('classifies testing', () => {
    const f = makeFeatures({ keywords: ['test'] })
    expect(classifyIntent(f, t).intent).toBe('testing')
  })

  it('classifies documentation', () => {
    const f = makeFeatures({ keywords: ['readme'] })
    expect(classifyIntent(f, t).intent).toBe('documentation')
  })

  it('classifies code_review', () => {
    const f = makeFeatures({ keywords: ['review'] })
    expect(classifyIntent(f, t).intent).toBe('code_review')
  })

  it('falls back to exploration', () => {
    const f = makeFeatures({ keywords: ['banana'] })
    expect(classifyIntent(f, t).intent).toBe('exploration')
    expect(classifyIntent(f, t).confidence).toBe(0.5)
  })

  it('debugging beats refactoring (priority order)', () => {
    const f = makeFeatures({ has_error_trace: true, keywords: ['refactor'] })
    expect(classifyIntent(f, t).intent).toBe('debugging')
  })
})

describe('classifyComplexity', () => {
  it('classifies simple prompts', () => {
    const f = makeFeatures({ prompt_length: 'short', code_ratio: 'none' })
    expect(classifyComplexity(f)).toBe('simple')
  })

  it('classifies complex prompts', () => {
    const f = makeFeatures({
      prompt_length: 'long',
      code_ratio: 'high',
      has_code_block: true,
      keywords: ['a', 'b', 'c', 'd', 'e', 'f'],
    })
    expect(classifyComplexity(f)).toBe('complex')
  })
})

describe('classifyPromptStyle', () => {
  it('detects directive style', () => {
    const f = makeFeatures({ prompt_length: 'short', structure_type: 'imperative' })
    expect(classifyPromptStyle(f)).toBe('directive')
  })

  it('detects context_heavy style', () => {
    const f = makeFeatures({ code_ratio: 'high' })
    expect(classifyPromptStyle(f)).toBe('context_heavy')
  })
})

describe('classifyDomain', () => {
  it('detects web_frontend from react', () => {
    const f = makeFeatures({ frameworks: ['react'] })
    expect(classifyDomain(f)).toBe('web_frontend')
  })

  it('detects web_backend from express', () => {
    const f = makeFeatures({ frameworks: ['express'] })
    expect(classifyDomain(f)).toBe('web_backend')
  })

  it('detects systems from rust', () => {
    const f = makeFeatures({ language_signals: ['rust'] })
    expect(classifyDomain(f)).toBe('systems')
  })

  it('falls back to general', () => {
    expect(classifyDomain(makeFeatures())).toBe('general')
  })
})

describe('classify (orchestrator)', () => {
  it('returns full DerivedLabels', () => {
    const f = makeFeatures({
      has_error_trace: true,
      prompt_length: 'long',
      frameworks: ['react'],
    })
    const labels = classify(f, t)
    expect(labels.intent).toBe('debugging')
    expect(labels.domain).toBe('web_frontend')
    expect(labels.taxonomy_version).toBe('v1.0')
    expect(labels.confidence).toBe(0.9)
  })
})
