import { describe, expect, it } from 'vitest'
import terms from '../data/terms.json'
import type { TermDictionary } from './types.js'
import {
  classifyPromptLength,
  classifyStructureType,
  computeCodeRatio,
  detectCodeBlock,
  detectErrorTrace,
  extractFeatures,
  extractFrameworks,
  extractKeywords,
  extractLanguageSignals,
  extractToolsChain,
  getTimeBucket,
} from './features.js'

const t = terms as TermDictionary

describe('classifyPromptLength', () => {
  it('classifies short prompts (<25 words)', () => {
    expect(classifyPromptLength('fix the bug')).toBe('short')
  })

  it('classifies medium prompts (25-100 words)', () => {
    const words = Array(50).fill('word').join(' ')
    expect(classifyPromptLength(words)).toBe('medium')
  })

  it('classifies long prompts (100+ words)', () => {
    const words = Array(101).fill('word').join(' ')
    expect(classifyPromptLength(words)).toBe('long')
  })

  it('handles boundary at 25 words', () => {
    const exactly24 = Array(24).fill('word').join(' ')
    const exactly25 = Array(25).fill('word').join(' ')
    expect(classifyPromptLength(exactly24)).toBe('short')
    expect(classifyPromptLength(exactly25)).toBe('medium')
  })
})

describe('computeCodeRatio', () => {
  it('returns none when no code blocks', () => {
    expect(computeCodeRatio('just plain text here')).toBe('none')
  })

  it('returns low for small code blocks in lots of text', () => {
    const text = 'A'.repeat(100) + '```x```' + 'B'.repeat(100)
    expect(computeCodeRatio(text)).toBe('low')
  })

  it('returns high for mostly code', () => {
    const code = 'x'.repeat(200)
    const text = '```' + code + '```'
    expect(computeCodeRatio(text)).toBe('high')
  })
})

describe('classifyStructureType', () => {
  it('detects questions', () => {
    expect(classifyStructureType('how do I deploy to vercel?')).toBe('question')
    expect(classifyStructureType('what is the difference between let and const?')).toBe('question')
  })

  it('detects imperative commands', () => {
    expect(classifyStructureType('add a login button to the header')).toBe('imperative')
    expect(classifyStructureType('refactor the auth module')).toBe('imperative')
  })

  it('detects error pastes', () => {
    expect(classifyStructureType('TypeError: Cannot read property of undefined')).toBe('error_paste')
  })

  it('detects context dumps', () => {
    const code = 'x'.repeat(200)
    expect(classifyStructureType('```' + code + '```')).toBe('context_dump')
  })

  it('falls back to conversation', () => {
    expect(classifyStructureType('I think we should use redis for caching')).toBe('conversation')
  })
})

describe('detectErrorTrace', () => {
  it('detects JS stack traces', () => {
    expect(detectErrorTrace('at Object.<anonymous> (/app/index.js:10:5)')).toBe(true)
  })

  it('detects Python tracebacks', () => {
    expect(detectErrorTrace('Traceback (most recent call last):')).toBe(true)
  })

  it('detects TypeError patterns', () => {
    expect(detectErrorTrace('TypeError: foo is not a function')).toBe(true)
  })

  it('returns false for clean prompts', () => {
    expect(detectErrorTrace('add a new button to the page')).toBe(false)
  })
})

describe('extractKeywords', () => {
  it('extracts error terms', () => {
    const kw = extractKeywords('I got a TypeError when running the build', t)
    expect(kw).toContain('typeerror')
  })

  it('extracts build terms', () => {
    const kw = extractKeywords('create a new component for the dashboard', t)
    expect(kw).toContain('create')
    expect(kw).toContain('component')
  })

  it('extracts refactor terms', () => {
    const kw = extractKeywords('refactor this function and simplify it', t)
    expect(kw).toContain('refactor')
    expect(kw).toContain('simplify')
  })

  it('returns empty for non-programming text', () => {
    const kw = extractKeywords('the weather is nice today', t)
    expect(kw.length).toBe(0)
  })
})

describe('extractLanguageSignals', () => {
  it('detects typescript', () => {
    const langs = extractLanguageSignals('update the tsconfig and fix the .tsx file', t)
    expect(langs).toContain('typescript')
  })

  it('detects python', () => {
    const langs = extractLanguageSignals('create a new .py module with pip install', t)
    expect(langs).toContain('python')
  })

  it('detects multiple languages', () => {
    const langs = extractLanguageSignals('convert the python script to typescript', t)
    expect(langs).toContain('python')
    expect(langs).toContain('typescript')
  })
})

describe('extractFrameworks', () => {
  it('detects react', () => {
    const fw = extractFrameworks('add useState to the component', t)
    expect(fw).toContain('react')
  })

  it('detects cloudflare workers', () => {
    const fw = extractFrameworks('deploy with wrangler to cloudflare workers', t)
    expect(fw).toContain('cloudflare')
  })
})

describe('extractToolsChain', () => {
  it('extracts tool names', () => {
    const tools = extractToolsChain('use Read to check the file then Edit to change it')
    expect(tools).toEqual(['Read', 'Edit'])
  })

  it('deduplicates tools', () => {
    const tools = extractToolsChain('Read the file, then Read another file')
    expect(tools).toEqual(['Read'])
  })

  it('returns empty when no tools mentioned', () => {
    expect(extractToolsChain('fix the bug please')).toEqual([])
  })
})

describe('getTimeBucket', () => {
  it('classifies morning (6-11)', () => {
    const d = new Date(2026, 0, 1, 9, 0)
    expect(getTimeBucket(d).hour_bucket).toBe('morning')
  })

  it('classifies afternoon (12-17)', () => {
    const d = new Date(2026, 0, 1, 14, 0)
    expect(getTimeBucket(d).hour_bucket).toBe('afternoon')
  })

  it('classifies evening (18-23)', () => {
    const d = new Date(2026, 0, 1, 20, 0)
    expect(getTimeBucket(d).hour_bucket).toBe('evening')
  })

  it('classifies night (0-5)', () => {
    const d = new Date(2026, 0, 1, 3, 0)
    expect(getTimeBucket(d).hour_bucket).toBe('night')
  })

  it('includes correct day of week', () => {
    // Jan 1, 2026 is a Thursday
    const d = new Date(2026, 0, 1, 12, 0)
    expect(getTimeBucket(d).day_of_week).toBe('thursday')
  })
})

describe('extractFeatures (orchestrator)', () => {
  it('combines all extractions', () => {
    const features = extractFeatures(
      'how do I add useState to my react component?',
      t,
      new Date(2026, 0, 1, 10, 0),
    )
    expect(features.structure_type).toBe('question')
    expect(features.prompt_length).toBe('short')
    expect(features.frameworks).toContain('react')
    expect(features.has_error_trace).toBe(false)
    expect(features.hour_bucket).toBe('morning')
  })
})
