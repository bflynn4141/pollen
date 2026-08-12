import { describe, expect, it } from 'vitest'
import {
  evaluateCoachRules, gatherCoachInputs, computeCoachFindings,
  type CoachInputs, type RateSample,
} from './coach-rules.js'
import { initDb, insertSession, insertContribution, insertToolEvent } from './store.js'
import type { Contribution, CoarsenedToolEvent, SessionRecord } from './types.js'

const emptySample: RateSample = { sessions: 0, completionPct: 0, avgSatisfaction: null }

/** Baseline inputs where no rule fires. */
function baseInputs(overrides: Partial<CoachInputs> = {}): CoachInputs {
  return {
    windowDays: 7,
    promptedSessions: 30,
    totalPrompts: 300,
    avgPromptsPerSession: 10,
    avgSatisfaction: 60,
    completionPct: 60,
    abandonedPct: 10,
    errorPastePromptPct: 5,
    debuggingPromptPct: 10,
    richPromptSessions: emptySample,
    leanPromptSessions: emptySample,
    toolUsingSessions: 25,
    retryStormSessions: 0,
    over25PromptSessions: 0,
    focusedSessions: emptySample,
    marathonSessions: emptySample,
    minimalStyleSessions: emptySample,
    fullStyleSessions: emptySample,
    sessionsWithFailures: 0,
    avgErrorRecoveryRate: null,
    topicSatisfaction: [],
    intentSatisfaction: [],
    hourAbandonment: [],
    subagentSessions: 10,
    planModeSessions: 10,
    compactionThrashSessions: 0,
    postCutoffToolEvents: 0,
    toolStats: [],
    sources: { claudeCode: null, codex: null },
    ...overrides,
  }
}

const ids = (findings: ReturnType<typeof evaluateCoachRules>) => findings.map(f => f.id)

describe('evaluateCoachRules — fire/no-fire', () => {
  it('fires nothing on the quiet baseline', () => {
    expect(evaluateCoachRules(baseInputs())).toEqual([])
  })

  it('evidence-gap fires on low error-paste + high debugging share', () => {
    const findings = evaluateCoachRules(baseInputs({
      errorPastePromptPct: 0.4, debuggingPromptPct: 35,
    }))
    expect(ids(findings)).toContain('evidence-gap')
  })

  it('evidence-gap stays silent when errors are pasted or debugging is rare', () => {
    expect(ids(evaluateCoachRules(baseInputs({ errorPastePromptPct: 3, debuggingPromptPct: 35 })))).not.toContain('evidence-gap')
    expect(ids(evaluateCoachRules(baseInputs({ errorPastePromptPct: 0.4, debuggingPromptPct: 15 })))).not.toContain('evidence-gap')
  })

  it('evidence-gap payoff uses own-data contrast only when the data supports it', () => {
    const withContrast = evaluateCoachRules(baseInputs({
      errorPastePromptPct: 0.4, debuggingPromptPct: 35,
      richPromptSessions: { sessions: 20, completionPct: 79, avgSatisfaction: 70 },
      leanPromptSessions: { sessions: 20, completionPct: 22, avgSatisfaction: 40 },
    })).find(f => f.id === 'evidence-gap')!
    expect(withContrast.payoff).toContain('79%')
    expect(withContrast.payoff).toContain('22%')

    const noContrast = evaluateCoachRules(baseInputs({
      errorPastePromptPct: 0.4, debuggingPromptPct: 35,
      richPromptSessions: { sessions: 20, completionPct: 30, avgSatisfaction: 50 },
      leanPromptSessions: { sessions: 20, completionPct: 60, avgSatisfaction: 60 },
    })).find(f => f.id === 'evidence-gap')!
    expect(noContrast.payoff).not.toMatch(/\d+% of sessions finish/)
  })

  it('retry-storms fires at >= 20% of tool-using sessions', () => {
    expect(ids(evaluateCoachRules(baseInputs({ toolUsingSessions: 20, retryStormSessions: 5 })))).toContain('retry-storms')
    expect(ids(evaluateCoachRules(baseInputs({ toolUsingSessions: 20, retryStormSessions: 3 })))).not.toContain('retry-storms')
    // min-sample gate
    expect(ids(evaluateCoachRules(baseInputs({ toolUsingSessions: 10, retryStormSessions: 8 })))).not.toContain('retry-storms')
  })

  it('marathon-sessions fires on avg prompts >= 25 and only claims payoff the data shows', () => {
    const fired = evaluateCoachRules(baseInputs({
      avgPromptsPerSession: 40, over25PromptSessions: 20,
      focusedSessions: { sessions: 15, completionPct: 80, avgSatisfaction: 65 },
      marathonSessions: { sessions: 12, completionPct: 30, avgSatisfaction: 40 },
    })).find(f => f.id === 'marathon-sessions')!
    expect(fired.payoff).toContain('80%')
    expect(fired.payoff).toContain('30%')

    expect(ids(evaluateCoachRules(baseInputs({ avgPromptsPerSession: 20 })))).not.toContain('marathon-sessions')
  })

  it('minimal-prompt-penalty needs a >= 15 point gap and 10+ sessions per side', () => {
    const fire = baseInputs({
      minimalStyleSessions: { sessions: 12, completionPct: 30, avgSatisfaction: 40 },
      fullStyleSessions: { sessions: 12, completionPct: 70, avgSatisfaction: 60 },
    })
    expect(ids(evaluateCoachRules(fire))).toContain('minimal-prompt-penalty')

    const smallGap = baseInputs({
      minimalStyleSessions: { sessions: 12, completionPct: 60, avgSatisfaction: 55 },
      fullStyleSessions: { sessions: 12, completionPct: 65, avgSatisfaction: 60 },
    })
    expect(ids(evaluateCoachRules(smallGap))).not.toContain('minimal-prompt-penalty')

    const thinSample = baseInputs({
      minimalStyleSessions: { sessions: 4, completionPct: 30, avgSatisfaction: 30 },
      fullStyleSessions: { sessions: 12, completionPct: 70, avgSatisfaction: 60 },
    })
    expect(ids(evaluateCoachRules(thinSample))).not.toContain('minimal-prompt-penalty')
  })

  it('low-error-recovery fires under 0.5 with enough failing sessions', () => {
    expect(ids(evaluateCoachRules(baseInputs({ sessionsWithFailures: 20, avgErrorRecoveryRate: 0.3 })))).toContain('low-error-recovery')
    expect(ids(evaluateCoachRules(baseInputs({ sessionsWithFailures: 20, avgErrorRecoveryRate: 0.6 })))).not.toContain('low-error-recovery')
    expect(ids(evaluateCoachRules(baseInputs({ sessionsWithFailures: 5, avgErrorRecoveryRate: 0.1 })))).not.toContain('low-error-recovery')
  })

  it('struggling-topic names a topic 15+ points below average with 10+ sessions', () => {
    const fired = evaluateCoachRules(baseInputs({
      topicSatisfaction: [{ topic: 'auth', sessions: 12, avgSatisfaction: 40 }],
    })).find(f => f.id === 'struggling-topic')!
    expect(fired.headline).toContain('auth')

    expect(ids(evaluateCoachRules(baseInputs({
      topicSatisfaction: [{ topic: 'auth', sessions: 8, avgSatisfaction: 40 }],
    })))).not.toContain('struggling-topic')
    expect(ids(evaluateCoachRules(baseInputs({
      topicSatisfaction: [{ topic: 'auth', sessions: 12, avgSatisfaction: 50 }],
    })))).not.toContain('struggling-topic')
  })

  it('struggling-intent speaks plainly, not in metric names', () => {
    const fired = evaluateCoachRules(baseInputs({
      intentSatisfaction: [{ intent: 'feature_build', sessions: 15, avgSatisfaction: 40 }],
    })).find(f => f.id === 'struggling-intent')!
    expect(fired.headline).not.toContain('feature_build')
    expect(fired.headline.toLowerCase()).toContain('build new features')
  })

  it('abandonment-cluster needs 2x the overall rate and 5+ sessions', () => {
    expect(ids(evaluateCoachRules(baseInputs({
      abandonedPct: 10,
      hourAbandonment: [{ bucket: 'night', sessions: 6, abandonedPct: 25 }],
    })))).toContain('abandonment-cluster')
    expect(ids(evaluateCoachRules(baseInputs({
      abandonedPct: 10,
      hourAbandonment: [{ bucket: 'night', sessions: 4, abandonedPct: 40 }],
    })))).not.toContain('abandonment-cluster')
    expect(ids(evaluateCoachRules(baseInputs({
      abandonedPct: 10,
      hourAbandonment: [{ bucket: 'night', sessions: 8, abandonedPct: 15 }],
    })))).not.toContain('abandonment-cluster')
  })

  it('subagents-untapped and plan-mode-unused need 40+ sessions and near-zero usage', () => {
    const fired = evaluateCoachRules(baseInputs({
      promptedSessions: 50, subagentSessions: 1, planModeSessions: 0,
    }))
    expect(ids(fired)).toContain('subagents-untapped')
    expect(ids(fired)).toContain('plan-mode-unused')

    const smallSample = evaluateCoachRules(baseInputs({
      promptedSessions: 30, subagentSessions: 0, planModeSessions: 0,
    }))
    expect(ids(smallSample)).not.toContain('subagents-untapped')
    expect(ids(smallSample)).not.toContain('plan-mode-unused')
  })

  it('compaction-thrash fires at >= 10% of sessions with 5+ affected', () => {
    expect(ids(evaluateCoachRules(baseInputs({ compactionThrashSessions: 5 })))).toContain('compaction-thrash')
    expect(ids(evaluateCoachRules(baseInputs({ compactionThrashSessions: 2 })))).not.toContain('compaction-thrash')
  })

  it('tool-trouble skips on a thin post-cutoff sample and annotates reliability', () => {
    const fired = evaluateCoachRules(baseInputs({
      postCutoffToolEvents: 100,
      toolStats: [{ tool: 'Bash', uses: 30, successPct: 45 }],
    })).find(f => f.id === 'tool-trouble')!
    expect(fired.headline).toContain('Bash')
    expect(fired.payoff).toContain('Aug 5, 2026')

    expect(ids(evaluateCoachRules(baseInputs({
      postCutoffToolEvents: 40,
      toolStats: [{ tool: 'Bash', uses: 30, successPct: 45 }],
    })))).not.toContain('tool-trouble')
    expect(ids(evaluateCoachRules(baseInputs({
      postCutoffToolEvents: 100,
      toolStats: [{ tool: 'Bash', uses: 30, successPct: 80 }],
    })))).not.toContain('tool-trouble')
  })

  it('two-agent-imbalance is descriptive only and needs both sources', () => {
    const fired = evaluateCoachRules(baseInputs({
      sources: {
        claudeCode: { sessions: 20, avgPrompts: 40, avgTools: 120 },
        codex: { sessions: 15, avgPrompts: 5, avgTools: 60 },
      },
    })).find(f => f.id === 'two-agent-imbalance')!
    expect(fired.payoff).toBe('')

    expect(ids(evaluateCoachRules(baseInputs({
      sources: { claudeCode: { sessions: 20, avgPrompts: 40, avgTools: 120 }, codex: null },
    })))).not.toContain('two-agent-imbalance')
  })

  it('ranks findings by impact descending', () => {
    const findings = evaluateCoachRules(baseInputs({
      promptedSessions: 50,
      errorPastePromptPct: 0.4, debuggingPromptPct: 40,   // evidence-gap: 9 * 0.4 = 3.6
      subagentSessions: 0, planModeSessions: 0,           // subagents 4*1=4, plan 3*1=3
      toolUsingSessions: 40, retryStormSessions: 20,      // retry: 8 * 0.5 = 4
    }))
    expect(findings.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < findings.length; i++) {
      expect(findings[i - 1].impact).toBeGreaterThanOrEqual(findings[i].impact)
    }
  })

  it('never uses raw metric names in card language', () => {
    const noisy = evaluateCoachRules(baseInputs({
      promptedSessions: 50,
      errorPastePromptPct: 0.4, debuggingPromptPct: 40,
      subagentSessions: 0, planModeSessions: 0,
      toolUsingSessions: 40, retryStormSessions: 20,
      sessionsWithFailures: 30, avgErrorRecoveryRate: 0.2,
      avgPromptsPerSession: 40, over25PromptSessions: 30,
    }))
    for (const f of noisy) {
      const prose = `${f.headline} ${f.what_you_do} ${f.what_to_try} ${f.payoff}`
      expect(prose).not.toMatch(/search_to_edit_ratio|error_recovery_rate|satisfaction_score|prompt_count|structure_type/)
    }
  })
})

// ── DB-level: promptless dilution guard ─────────────────

function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    session_id: crypto.randomUUID(),
    model: 'claude-sonnet-4-6',
    source: 'claude-code',
    started_at: Date.now() - 1000,
    ended_at: Date.now(),
    duration_bucket: 'medium',
    prompt_count: 0,
    tool_use_count: 0,
    tool_failure_count: 0,
    intent_sequence: null,
    dominant_intent: null,
    dominant_domain: null,
    unique_tools: null,
    languages_used: null,
    outcome: null,
    project_type: null,
    end_reason: null,
    mcp_servers_used: null,
    response_count: 0,
    avg_response_length: 0,
    satisfaction_score: null,
    satisfaction_signals: null,
    subject: null,
    contributor_id: 'contributor-test',
    permission_mode: null,
    ...overrides,
  } as SessionRecord
}

function makeContribution(sessionId: string, overrides: Partial<Contribution> = {}): Contribution {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now() - 500,
    session_id: sessionId,
    features: {
      keywords: [], tools_chain: [], language_signals: [], frameworks: [],
      prompt_length: 'medium', code_ratio: 'low', structure_type: 'imperative',
      session_depth: 'early', has_error_trace: false, has_code_block: false,
      day_of_week: 'Monday', hour_bucket: 'morning',
    },
    labels: {
      intent: 'feature_build', complexity: 'moderate', prompt_style: 'directive',
      domain: 'general', taxonomy_version: 'v1.0', confidence: 0.9,
    },
    action: null, topic: null,
    ...overrides,
  } as Contribution
}

describe('gatherCoachInputs — promptless dilution guard', () => {
  it('computes every rate off prompted sessions only (50 empty + 10 real)', () => {
    const db = initDb()
    // 50 promptless session shells (clear/resume noise)
    for (let i = 0; i < 50; i++) {
      insertSession(db, makeSession({ prompt_count: 0, outcome: 'abandoned' }))
    }
    // 10 real sessions: 30 prompts each, 8 completed / 2 abandoned
    for (let i = 0; i < 10; i++) {
      const id = `real-${i}`
      insertSession(db, makeSession({
        session_id: id,
        prompt_count: 30,
        tool_use_count: 10,
        outcome: i < 8 ? 'completed' : 'abandoned',
        satisfaction_score: 70,
      }))
      insertContribution(db, makeContribution(id))
    }

    const inputs = gatherCoachInputs(db, { days: 7 })
    expect(inputs.promptedSessions).toBe(10)
    expect(inputs.totalPrompts).toBe(300)
    expect(inputs.avgPromptsPerSession).toBe(30)
    // 8/10 completed — NOT 8/60
    expect(inputs.completionPct).toBe(80)
    expect(inputs.abandonedPct).toBe(20)
    db.close()
  })

  it('window fallback widens to all-time when the window is thin', () => {
    const db = initDb()
    const old = Date.now() - 30 * 86_400_000
    for (let i = 0; i < 45; i++) {
      insertSession(db, makeSession({ started_at: old, ended_at: old + 1000, prompt_count: 5, outcome: 'completed' }))
    }
    const { inputs } = computeCoachFindings(db, { days: 7 })
    expect(inputs.windowDays).toBeNull()
    expect(inputs.promptedSessions).toBe(45)
    db.close()
  })

  it('tool events feed the reliability-gated tool stats', () => {
    const db = initDb()
    const sid = 'tool-sess'
    insertSession(db, makeSession({ session_id: sid, prompt_count: 3 }))
    for (let i = 0; i < 60; i++) {
      insertToolEvent(db, {
        id: crypto.randomUUID(),
        session_id: sid,
        timestamp: Date.now() - 100,
        tool_name: 'Bash',
        tool_category: 'execute',
        success: i % 2 === 0,
        error_category: null, file_extension: null, command_category: null,
        sequence_number: i, mcp_server: null, duration_ms: null,
      } as CoarsenedToolEvent)
    }
    const inputs = gatherCoachInputs(db, { days: 7 })
    expect(inputs.postCutoffToolEvents).toBe(60)
    expect(inputs.toolStats[0]).toMatchObject({ tool: 'Bash', uses: 60, successPct: 50 })
    db.close()
  })
})
