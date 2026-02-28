import type {
  CodeRatio,
  HourBucket,
  PromptLength,
  RawFeatures,
  SessionDepth,
  StructureType,
  TermDictionary,
} from './types.js'

export function extractKeywords(text: string, terms: TermDictionary): string[] {
  const lower = text.toLowerCase()
  const found = new Set<string>()

  const categories = [
    terms.error_terms,
    terms.build_terms,
    terms.refactor_terms,
    terms.learning_terms,
    terms.devops_terms,
    terms.testing_terms,
    terms.doc_terms,
    terms.review_terms,
  ]

  for (const category of categories) {
    for (const term of category) {
      const t = term.toLowerCase()
      // Multi-word terms use substring match; single words use word boundary
      if (t.includes(' ')) {
        if (lower.includes(t)) found.add(t)
      } else {
        const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
        if (re.test(lower)) found.add(t)
      }
    }
  }

  return [...found]
}

export function extractToolsChain(text: string): string[] {
  const toolPattern = /\b(Read|Edit|Write|Bash|Grep|Glob|Task|WebFetch|WebSearch|NotebookEdit|AskUserQuestion)\b/g
  const matches = text.match(toolPattern)
  if (!matches) return []
  // Preserve order, deduplicate
  return [...new Set(matches)]
}

export function extractLanguageSignals(text: string, terms: TermDictionary): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []

  for (const [language, signals] of Object.entries(terms.languages)) {
    for (const signal of signals) {
      if (lower.includes(signal.toLowerCase())) {
        found.push(language)
        break
      }
    }
  }

  return found
}

export function extractFrameworks(text: string, terms: TermDictionary): string[] {
  const lower = text.toLowerCase()
  const found: string[] = []

  for (const [framework, signals] of Object.entries(terms.frameworks)) {
    for (const signal of signals) {
      if (lower.includes(signal.toLowerCase())) {
        found.push(framework)
        break
      }
    }
  }

  return found
}

export function classifyPromptLength(text: string): PromptLength {
  const words = text.trim().split(/\s+/).filter(w => w.length > 0)
  if (words.length < 25) return 'short'
  if (words.length <= 100) return 'medium'
  return 'long'
}

export function computeCodeRatio(text: string): CodeRatio {
  if (!text.includes('```')) return 'none'

  let codeChars = 0
  const blocks = text.split('```')
  // Odd-indexed segments are inside code fences
  for (let i = 1; i < blocks.length; i += 2) {
    codeChars += blocks[i].length
  }

  const ratio = codeChars / text.length
  if (ratio < 0.3) return 'low'
  if (ratio <= 0.7) return 'medium'
  return 'high'
}

export function classifyStructureType(text: string): StructureType {
  const trimmed = text.trim()

  // Error paste: contains stack traces or error patterns
  if (detectErrorTrace(trimmed)) return 'error_paste'

  // Context dump: mostly code blocks
  if (computeCodeRatio(trimmed) === 'high') return 'context_dump'

  // Question: ends with ? or starts with question words
  if (trimmed.endsWith('?') || /^(how|what|why|when|where|which|can|does|is|should|could|would)\b/i.test(trimmed)) {
    return 'question'
  }

  // Imperative: starts with a verb-like word
  if (/^(add|create|build|fix|update|change|remove|delete|refactor|implement|make|write|set|move|rename|extract|deploy|run|install|test|check)\b/i.test(trimmed)) {
    return 'imperative'
  }

  return 'conversation'
}

export function detectErrorTrace(text: string): boolean {
  const patterns = [
    /at\s+\S+\s+\(.*:\d+:\d+\)/,     // JS stack trace
    /Traceback \(most recent call/,     // Python traceback
    /TypeError:|ReferenceError:|SyntaxError:|Error:/,
    /panic:/,                           // Go/Rust panic
    /ENOENT|ECONNREFUSED|EPERM/,       // Node.js errors
    /^\s+at\s+/m,                      // Indented "at" lines
  ]
  return patterns.some(p => p.test(text))
}

export function detectCodeBlock(text: string): boolean {
  return text.includes('```')
}

export function getTimeBucket(date: Date): { day_of_week: string; hour_bucket: HourBucket } {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const hour = date.getHours()

  let hour_bucket: HourBucket
  if (hour < 6) hour_bucket = 'night'
  else if (hour < 12) hour_bucket = 'morning'
  else if (hour < 18) hour_bucket = 'afternoon'
  else hour_bucket = 'evening'

  return {
    day_of_week: days[date.getDay()],
    hour_bucket,
  }
}

export function extractFeatures(
  text: string,
  terms: TermDictionary,
  timestamp: Date,
  sessionDepth: SessionDepth = 'first',
): RawFeatures {
  const time = getTimeBucket(timestamp)

  return {
    keywords: extractKeywords(text, terms),
    tools_chain: extractToolsChain(text),
    language_signals: extractLanguageSignals(text, terms),
    frameworks: extractFrameworks(text, terms),
    prompt_length: classifyPromptLength(text),
    code_ratio: computeCodeRatio(text),
    structure_type: classifyStructureType(text),
    session_depth: sessionDepth,
    has_error_trace: detectErrorTrace(text),
    has_code_block: detectCodeBlock(text),
    day_of_week: time.day_of_week,
    hour_bucket: time.hour_bucket,
  }
}
