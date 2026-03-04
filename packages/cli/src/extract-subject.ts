import Anthropic from '@anthropic-ai/sdk'
import { SUBJECT_MODEL } from './config.js'

const SYSTEM_PROMPT =
  'Extract a 3-5 word subject describing what the user is building or working on. ' +
  'Output ONLY the subject, nothing else. ' +
  'Examples: "Epstein files explorer", "NFT marketplace for music", "SaaS auth system", "CLI weather tool". ' +
  'If the prompt is too vague to determine a subject, output "general".'

export async function extractSubject(promptText: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: SUBJECT_MODEL,
    max_tokens: 30,
    messages: [{ role: 'user', content: promptText }],
    system: SYSTEM_PROMPT,
  })

  const block = response.content[0]
  if (block.type !== 'text') return null

  const subject = block.text.trim()
  return subject || null
}
