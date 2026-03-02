import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT =
  'Extract a 3-5 word subject describing the developer task intent. ' +
  'NEVER include project names, product names, company names, or proper nouns. ' +
  'Focus on the generic action pattern so similar tasks from different users produce identical subjects. ' +
  'Output ONLY the subject, nothing else.\n\n' +
  'Start with one of these verbs when possible: Build, Fix, Debug, Research, Set up, Deploy, Test, Refactor, Write, Design, Optimize, Review, Integrate, Migrate, Update, Remove.\n\n' +
  'Examples:\n' +
  '"add auth to my Next.js app" → "Build authentication flow"\n' +
  '"debug why my wallet won\'t send" → "Debug wallet transactions"\n' +
  '"build a landing page for my project" → "Build landing page"\n' +
  '"create a video tutorial about wallets" → "Write explainer video"\n' +
  '"research LLM agent frameworks" → "Research LLM agent frameworks"\n' +
  '"fix CSS layout on the dashboard" → "Fix CSS layout"\n' +
  '"audit my project setup with agents" → "Review project setup"\n' +
  '"set up CI/CD pipeline" → "Set up CI/CD pipeline"\n\n' +
  'If the prompt is too vague to determine intent, output "general".'

// Canonical verb mappings — sorted longest-prefix-first so multi-word
// prefixes like "set up" match before single-word ones like "set".
const VERB_MAP: [string, string][] = [
  // multi-word first
  ['set up', 'Set up'],
  ['setting up', 'Set up'],
  ['clean up', 'Remove'],
  ['look into', 'Research'],
  // create → Build
  ['create', 'Build'],
  ['add', 'Build'],
  ['implement', 'Build'],
  ['make', 'Build'],
  ['scaffold', 'Build'],
  ['develop', 'Build'],
  // resolve/troubleshoot → Fix
  ['resolve', 'Fix'],
  ['troubleshoot', 'Fix'],
  ['solve', 'Fix'],
  ['repair', 'Fix'],
  // explore/investigate → Research
  ['explore', 'Research'],
  ['investigate', 'Research'],
  ['compare', 'Research'],
  ['analyze', 'Research'],
  ['study', 'Research'],
  ['evaluate', 'Research'],
  ['audit', 'Review'],
  ['inspect', 'Review'],
  // configure/install → Set up
  ['configure', 'Set up'],
  ['install', 'Set up'],
  ['initialize', 'Set up'],
  ['bootstrap', 'Set up'],
  // change/modify → Update
  ['change', 'Update'],
  ['modify', 'Update'],
  ['edit', 'Update'],
  ['adjust', 'Update'],
  ['tweak', 'Update'],
  // delete/strip → Remove
  ['delete', 'Remove'],
  ['strip', 'Remove'],
  ['prune', 'Remove'],
  // draft/document → Write
  ['draft', 'Write'],
  ['document', 'Write'],
  ['compose', 'Write'],
]

/**
 * Normalize the leading verb to a canonical form so that
 * "Create landing page" and "Build landing page" aggregate
 * into a single topic. Preserves original casing for the rest.
 */
export function normalizeSubject(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return trimmed

  const lower = trimmed.toLowerCase()

  for (const [prefix, canonical] of VERB_MAP) {
    if (lower.startsWith(prefix + ' ')) {
      const rest = trimmed.slice(prefix.length).trimStart()
      return `${canonical} ${rest}`
    }
  }

  // No match — just ensure first letter is capitalized
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export async function extractSubject(promptText: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 30,
    messages: [{ role: 'user', content: promptText }],
    system: SYSTEM_PROMPT,
  })

  const block = response.content[0]
  if (block.type !== 'text') return null

  const subject = block.text.trim()
  if (!subject) return null

  return normalizeSubject(subject)
}
