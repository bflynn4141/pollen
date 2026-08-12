import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildBriefSummary, generateBrief, isoWeekOf, polishBrief, renderBrief,
} from './brief.js'
import { gatherCoachInputs, evaluateCoachRules, type CoachFinding } from './coach-rules.js'
import { initDb, insertSession, insertContribution } from './store.js'
import type { Contribution, SessionRecord } from './types.js'

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    session_id: crypto.randomUUID(),
    model: 'claude-sonnet-4-6',
    source: 'claude-code',
    started_at: Date.now() - 1000,
    ended_at: Date.now(),
    duration_bucket: 'medium',
    prompt_count: 5,
    tool_use_count: 3,
    tool_failure_count: 0,
    intent_sequence: null,
    dominant_intent: 'feature_build',
    dominant_domain: 'general',
    unique_tools: null,
    languages_used: null,
    outcome: 'completed',
    project_type: null,
    end_reason: null,
    mcp_servers_used: null,
    response_count: 0,
    avg_response_length: 0,
    satisfaction_score: 60,
    satisfaction_signals: null,
    subject: 'SECRET-SUBJECT build stripe checkout',
    contributor_id: 'contrib-SECRET-ID',
    permission_mode: null,
    transcript_path: '/Users/testuser/secret/transcript.jsonl',
    ...overrides,
  } as SessionRecord
}

function makeContribution(sessionId: string, overrides: Partial<Contribution> = {}): Contribution {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now() - 500,
    session_id: sessionId,
    features: {
      keywords: ['SECRET-KEYWORD'], tools_chain: [], language_signals: [], frameworks: [],
      prompt_length: 'short', code_ratio: 'none', structure_type: 'imperative',
      session_depth: 'early', has_error_trace: false, has_code_block: false,
      day_of_week: 'Monday', hour_bucket: 'night',
    },
    labels: {
      intent: 'debugging', complexity: 'moderate', prompt_style: 'minimal',
      domain: 'general', taxonomy_version: 'v1.0', confidence: 0.9,
    },
    action: 'fix', topic: 'auth',
    ...overrides,
  } as Contribution
}

function seededDb() {
  const db = initDb()
  for (let i = 0; i < 50; i++) {
    const id = `s-${i}`
    insertSession(db, makeSession({
      session_id: id,
      prompt_count: 30,
      outcome: i % 3 === 0 ? 'abandoned' : 'completed',
      satisfaction_score: i % 2 === 0 ? 40 : 70,
      subagent_count: 0,
    }))
    insertContribution(db, makeContribution(id))
  }
  return db
}

const sampleFinding = (id: string, impact: number): CoachFinding => ({
  id,
  headline: `Headline for ${id}`,
  what_you_do: 'You do the thing.',
  what_to_try: 'Try the other thing.',
  payoff: 'It pays off.',
  evidence: { 'a rate': '79% vs 22%' },
  impact,
})

describe('buildBriefSummary — privacy', () => {
  it('contains no prompt text, subjects, paths, or contributor ids', () => {
    const db = seededDb()
    const inputs = gatherCoachInputs(db, { days: 7 })
    const findings = evaluateCoachRules(inputs)
    const summary = buildBriefSummary(inputs, findings)
    const serialized = JSON.stringify(summary)

    expect(serialized).not.toContain('SECRET-SUBJECT')
    expect(serialized).not.toContain('SECRET-KEYWORD')
    expect(serialized).not.toContain('contrib-SECRET-ID')
    expect(serialized).not.toContain('/Users/')
    expect(serialized).not.toContain('transcript')
    // No free-text-bearing keys
    const keys: string[] = []
    JSON.parse(serialized, (key, value) => { keys.push(key); return value })
    for (const forbidden of ['subject', 'prompt_text', 'transcript_path', 'contributor_id', 'cwd', 'keywords']) {
      expect(keys).not.toContain(forbidden)
    }
    db.close()
  })
})

describe('renderBrief', () => {
  it('renders three cards with headlines, evidence, and the local-compute footer', () => {
    const db = seededDb()
    const inputs = gatherCoachInputs(db, { days: 7 })
    const summary = buildBriefSummary(inputs, [
      sampleFinding('one', 3), sampleFinding('two', 2), sampleFinding('three', 1),
    ])
    const rendered = renderBrief(summary, null)

    expect(rendered.polish).toBe('template')
    for (const id of ['one', 'two', 'three']) {
      expect(rendered.html).toContain(`Headline for ${id}`)
      expect(rendered.text).toContain(`Headline for ${id}`)
    }
    expect(rendered.html).toContain('79% vs 22%')
    expect(rendered.html).toContain('computed locally')
    expect(rendered.subject).toContain('Headline for one')
    db.close()
  })

  it('prefers polished prose when provided', () => {
    const summary = buildBriefSummary(gatherCoachInputs(initDb(), { days: 7 }), [sampleFinding('one', 3)])
    const rendered = renderBrief(summary, {
      intro: 'A polished intro sentence. And another.',
      cards: [{ id: 'one', prose: 'Polished card prose here.' }],
    })
    expect(rendered.polish).toBe('claude')
    expect(rendered.html).toContain('A polished intro sentence.')
    expect(rendered.html).toContain('Polished card prose here.')
    expect(rendered.html).not.toContain('You do the thing.')
  })
})

describe('polishBrief', () => {
  afterEach(() => vi.unstubAllEnvs())

  const summary = buildBriefSummary(gatherCoachInputs(initDb(), { days: 7 }), [sampleFinding('one', 3)])

  it('returns null without an API key (template fallback)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    delete process.env.ANTHROPIC_API_KEY
    expect(await polishBrief(summary)).toBeNull()
  })

  it('parses a well-formed polish response', async () => {
    const factory = () => ({
      messages: {
        create: async () => ({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: JSON.stringify({ intro: 'Two sentences. Right here.', cards: [{ id: 'one', prose: 'Nice prose.' }] }) }],
        }),
      },
    }) as never
    const result = await polishBrief(summary, factory)
    expect(result?.intro).toBe('Two sentences. Right here.')
    expect(result?.cards[0].prose).toBe('Nice prose.')
  })

  it('returns null on a refusal stop reason', async () => {
    const factory = () => ({
      messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) },
    }) as never
    expect(await polishBrief(summary, factory)).toBeNull()
  })

  it('returns null on malformed model output', async () => {
    const factory = () => ({
      messages: {
        create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json at all' }] }),
      },
    }) as never
    expect(await polishBrief(summary, factory)).toBeNull()
  })
})

describe('generateBrief', () => {
  it('produces a fully functional template brief without any API key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const db = seededDb()
    const result = await generateBrief(db, { days: 7 })
    expect(result.polish).toBe('template')
    expect(result.findings.length).toBeLessThanOrEqual(3)
    expect(result.html).toContain('Pollen brief')
    expect(result.text).toContain('Pollen brief')
    db.close()
  })

  it('takes exactly the top 3 findings by impact', async () => {
    const db = seededDb()
    const result = await generateBrief(db, { days: 7 })
    const impacts = result.findings.map(f => f.impact)
    expect(impacts).toEqual([...impacts].sort((a, b) => b - a))
    db.close()
  })
})

describe('isoWeekOf', () => {
  it('computes ISO 8601 weeks', () => {
    expect(isoWeekOf(new Date(2026, 7, 6))).toBe('2026-W32')   // Thu Aug 6 2026
    expect(isoWeekOf(new Date(2026, 0, 1))).toBe('2026-W01')   // Thu Jan 1 2026
    expect(isoWeekOf(new Date(2027, 0, 1))).toBe('2026-W53')   // Fri Jan 1 2027 → ISO year 2026
  })
})

describe('renderBrief design guards', () => {
  it('uses the neutral GitHub-style palette: no warm accents, no uppercase styling', () => {
    const summary = buildBriefSummary(gatherCoachInputs(initDb(), { days: 7 }), [])
    const rendered = renderBrief(summary, null)
    expect(rendered.html).not.toMatch(/text-transform/i)
    expect(rendered.html).not.toMatch(/letter-spacing/i)
    for (const banned of ['#b8860b', '#f5b93c', '#faf5ea', '#eadfc8', '#8a7d5f']) {
      expect(rendered.html.toLowerCase()).not.toContain(banned)
    }
  })

  it('renders the activity heatmap grid, streak tiles, and legend when activity is provided', () => {
    const summary = buildBriefSummary(gatherCoachInputs(initDb(), { days: 7 }), [])
    const day = (date: string, prompts: number, level: 0 | 1 | 2 | 3 | 4) => ({ date, prompts, level })
    const rendered = renderBrief(summary, null, {
      weeks: [[day('2026-08-03', 5, 2), day('2026-08-04', 0, 0), day('2026-08-05', 12, 4), null, null, null, null]],
      currentStreak: 1,
      longestStreak: 5,
      activeDays: 2,
      totalDays: 3,
    })
    expect(rendered.html).toContain('day current streak')
    expect(rendered.html).toContain('days longest streak')
    expect(rendered.html).toContain('2/3')
    expect(rendered.html).toContain('#216e39') // top heat step present via level 4
    expect(rendered.html).toContain('2026-08-05 · 12 prompts')
    expect(rendered.html).toContain('less')
    expect(rendered.html).toContain('more')
    expect(rendered.text).toContain('Current streak 1')
  })
})
