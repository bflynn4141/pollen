import type { Complexity, DerivedLabels, Domain, Intent, PromptStyle, RawFeatures, TermDictionary } from './types.js'

export function classifyIntent(features: RawFeatures, terms: TermDictionary): { intent: Intent; confidence: number } {
  const kw = new Set(features.keywords)

  // Priority 1: Error traces or error keywords
  if (features.has_error_trace || terms.error_terms.some(t => kw.has(t.toLowerCase()))) {
    return { intent: 'debugging', confidence: 0.9 }
  }

  // Priority 2: Imperative + build keywords
  if (features.structure_type === 'imperative' && terms.build_terms.some(t => kw.has(t.toLowerCase()))) {
    return { intent: 'feature_build', confidence: 0.85 }
  }

  // Priority 3: Refactor keywords
  if (terms.refactor_terms.some(t => kw.has(t.toLowerCase()))) {
    return { intent: 'refactoring', confidence: 0.85 }
  }

  // Priority 4: Question + learning keywords
  if (features.structure_type === 'question' && terms.learning_terms.some(t => kw.has(t.toLowerCase()))) {
    return { intent: 'learning', confidence: 0.8 }
  }

  // Priority 5: DevOps keywords
  if (terms.devops_terms.some(t => kw.has(t.toLowerCase()))) {
    return { intent: 'devops', confidence: 0.85 }
  }

  // Priority 6: Testing keywords
  if (terms.testing_terms.some(t => kw.has(t.toLowerCase()))) {
    return { intent: 'testing', confidence: 0.85 }
  }

  // Priority 7: Documentation keywords
  if (terms.doc_terms.some(t => kw.has(t.toLowerCase()))) {
    return { intent: 'documentation', confidence: 0.85 }
  }

  // Priority 8: Review keywords
  if (terms.review_terms.some(t => kw.has(t.toLowerCase()))) {
    return { intent: 'code_review', confidence: 0.85 }
  }

  // Fallback
  return { intent: 'exploration', confidence: 0.5 }
}

export function classifyComplexity(features: RawFeatures): Complexity {
  let score = 0
  if (features.prompt_length === 'long') score += 2
  else if (features.prompt_length === 'medium') score += 1
  if (features.code_ratio === 'high') score += 2
  else if (features.code_ratio === 'medium') score += 1
  if (features.has_code_block) score += 1
  if (features.keywords.length > 5) score += 1

  if (score >= 4) return 'complex'
  if (score >= 2) return 'moderate'
  return 'simple'
}

export function classifyPromptStyle(features: RawFeatures): PromptStyle {
  if (features.code_ratio === 'high' || features.structure_type === 'context_dump') return 'context_heavy'
  if (features.prompt_length === 'short' && features.structure_type === 'imperative') return 'directive'
  if (features.prompt_length === 'short') return 'minimal'
  return 'conversational'
}

export function classifyDomain(features: RawFeatures): Domain {
  const fw = new Set(features.frameworks)
  const lang = new Set(features.language_signals)

  if (fw.has('react') || fw.has('vue') || fw.has('svelte') || fw.has('tailwind') || lang.has('css') || lang.has('html')) {
    return 'web_frontend'
  }
  if (fw.has('express') || fw.has('fastapi') || fw.has('django') || fw.has('cloudflare')) {
    return 'web_backend'
  }
  if (lang.has('sql') || fw.has('prisma')) return 'data'
  if (features.keywords.some(k => ['deploy', 'docker', 'ci', 'kubernetes', 'k8s'].includes(k))) return 'devops'
  if (lang.has('rust') || lang.has('go')) return 'systems'
  return 'general'
}

export function classify(features: RawFeatures, terms: TermDictionary): DerivedLabels {
  const { intent, confidence } = classifyIntent(features, terms)

  return {
    intent,
    complexity: classifyComplexity(features),
    prompt_style: classifyPromptStyle(features),
    domain: classifyDomain(features),
    taxonomy_version: 'v1.0',
    confidence,
  }
}
