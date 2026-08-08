/**
 * Pollen Brief coach rules — a pure rule engine over aggregate query outputs.
 *
 * Design contract:
 *  - `gatherCoachInputs` runs all SQL and produces a plain CoachInputs object.
 *  - `evaluateCoachRules` is pure: CoachInputs in, CoachFinding[] out.
 *  - Promptless sessions (prompt_count = 0) are excluded from EVERY
 *    denominator — they are hook-only session shells (clear/resume noise) and
 *    massively dilute rates.
 *  - Every card speaks plain English, second person, zero metric names.
 *    Numbers appear only as evidence ("79% vs 22%").
 *  - Payoff claims are only emitted when the user's own data shows the
 *    contrast; otherwise the card says what to try without inventing a number.
 */
import type Database from 'better-sqlite3'
import { MS_PER_DAY } from './config.js'

/**
 * Tool success rates recorded before this instant are unreliable (the
 * PostToolUseFailure wiring landed 2026-08-05). The tool-trouble rule only
 * looks at events after the cutoff and skips itself on a thin sample.
 */
export const TOOL_RELIABILITY_CUTOFF_MS = Date.UTC(2026, 7, 5) // 2026-08-05T00:00Z

export interface CoachFinding {
  id: string
  headline: string
  what_you_do: string
  what_to_try: string
  payoff: string
  evidence: Record<string, number | string>
  impact: number
}

export interface RateSample {
  sessions: number
  /** completed / decided sessions, 0-100. NaN-safe: 0 when no decided sessions */
  completionPct: number
  /** avg satisfaction 0-100, null when unscored */
  avgSatisfaction: number | null
}

export interface CoachInputs {
  /** Days covered, or null for all-time */
  windowDays: number | null
  promptedSessions: number
  totalPrompts: number
  avgPromptsPerSession: number
  avgSatisfaction: number | null
  completionPct: number
  abandonedPct: number

  // evidence-gap
  errorPastePromptPct: number
  debuggingPromptPct: number
  richPromptSessions: RateSample   // ≥1 long / context_dump / error_paste prompt
  leanPromptSessions: RateSample   // none of the above

  // retry storms
  toolUsingSessions: number
  retryStormSessions: number

  // marathon
  over25PromptSessions: number
  focusedSessions: RateSample      // ≤15 prompts
  marathonSessions: RateSample     // >40 prompts

  // minimal prompt penalty
  minimalStyleSessions: RateSample // majority short prompts
  fullStyleSessions: RateSample    // majority medium/long prompts

  // error recovery
  sessionsWithFailures: number
  avgErrorRecoveryRate: number | null

  // struggling topic / intent
  topicSatisfaction: Array<{ topic: string; sessions: number; avgSatisfaction: number }>
  intentSatisfaction: Array<{ intent: string; sessions: number; avgSatisfaction: number }>

  // abandonment by hour bucket (bucket of the session's first prompt)
  hourAbandonment: Array<{ bucket: string; sessions: number; abandonedPct: number }>

  // lifecycle features
  subagentSessions: number
  planModeSessions: number
  compactionThrashSessions: number // ≥2 compactions

  // tool trouble (post-cutoff only)
  postCutoffToolEvents: number
  toolStats: Array<{ tool: string; uses: number; successPct: number }>

  // two-agent split
  sources: {
    claudeCode: { sessions: number; avgPrompts: number; avgTools: number } | null
    codex: { sessions: number; avgPrompts: number; avgTools: number } | null
  }
}

const pct = (num: number, den: number): number => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)

function rateSample(row: { sessions: number; decided: number; completed: number; avg_sat: number | null } | undefined): RateSample {
  if (!row || row.sessions === 0) return { sessions: 0, completionPct: 0, avgSatisfaction: null }
  return {
    sessions: row.sessions,
    completionPct: pct(row.completed, row.decided),
    avgSatisfaction: row.avg_sat != null ? Math.round(row.avg_sat) : null,
  }
}

export function gatherCoachInputs(
  db: Database.Database,
  opts: { days?: number | null; now?: number } = {},
): CoachInputs {
  const now = opts.now ?? Date.now()
  const since = opts.days != null ? now - opts.days * MS_PER_DAY : 0

  // Base filter used everywhere: prompted sessions only.
  const overall = db.prepare(`
    SELECT COUNT(*) AS sessions,
      SUM(prompt_count) AS prompts,
      AVG(prompt_count) AS avg_prompts,
      AVG(satisfaction_score) AS avg_sat,
      SUM(CASE WHEN outcome IS NOT NULL THEN 1 ELSE 0 END) AS decided,
      SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
      SUM(CASE WHEN tool_use_count > 0 THEN 1 ELSE 0 END) AS tool_sessions,
      SUM(CASE WHEN satisfaction_signals LIKE '%"no_retry_storms":false%' THEN 1 ELSE 0 END) AS retry_storm_sessions,
      SUM(CASE WHEN prompt_count > 25 THEN 1 ELSE 0 END) AS over25,
      SUM(CASE WHEN error_recovery_rate IS NOT NULL THEN 1 ELSE 0 END) AS failure_sessions,
      AVG(error_recovery_rate) AS avg_recovery,
      SUM(CASE WHEN subagent_count > 0 THEN 1 ELSE 0 END) AS subagent_sessions,
      SUM(CASE WHEN permission_mode = 'plan' THEN 1 ELSE 0 END) AS plan_sessions,
      SUM(CASE WHEN context_compactions >= 2 THEN 1 ELSE 0 END) AS compaction_thrash
    FROM sessions
    WHERE prompt_count > 0 AND started_at > ?
  `).get(since) as {
    sessions: number; prompts: number | null; avg_prompts: number | null; avg_sat: number | null
    decided: number; completed: number; abandoned: number
    tool_sessions: number; retry_storm_sessions: number; over25: number
    failure_sessions: number; avg_recovery: number | null
    subagent_sessions: number; plan_sessions: number; compaction_thrash: number
  }

  const promptStats = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN c.structure_type = 'error_paste' THEN 1 ELSE 0 END) AS error_paste,
      SUM(CASE WHEN c.intent = 'debugging' THEN 1 ELSE 0 END) AS debugging
    FROM contributions c
    JOIN sessions s ON s.session_id = c.session_id
    WHERE s.prompt_count > 0 AND s.started_at > ?
  `).get(since) as { total: number; error_paste: number; debugging: number }

  const bySessionSample = (filterSql: string): RateSample => rateSample(db.prepare(`
    SELECT COUNT(*) AS sessions,
      SUM(CASE WHEN outcome IS NOT NULL THEN 1 ELSE 0 END) AS decided,
      SUM(CASE WHEN outcome = 'completed' THEN 1 ELSE 0 END) AS completed,
      AVG(satisfaction_score) AS avg_sat
    FROM sessions s
    WHERE s.prompt_count > 0 AND s.started_at > ? AND (${filterSql})
  `).get(since) as { sessions: number; decided: number; completed: number; avg_sat: number | null })

  const richFilter = `EXISTS (
    SELECT 1 FROM contributions c WHERE c.session_id = s.session_id
      AND (c.prompt_length = 'long' OR c.structure_type IN ('context_dump', 'error_paste'))
  )`
  const minimalFilter = `(
    SELECT SUM(CASE WHEN c.prompt_length = 'short' THEN 1 ELSE 0 END) * 2 > COUNT(*)
    FROM contributions c WHERE c.session_id = s.session_id
  )`

  const topicSatisfaction = db.prepare(`
    SELECT c.topic AS topic, COUNT(DISTINCT s.session_id) AS sessions,
      ROUND(AVG(s.satisfaction_score)) AS avg_sat
    FROM contributions c
    JOIN sessions s ON s.session_id = c.session_id
    WHERE c.topic IS NOT NULL AND s.satisfaction_score IS NOT NULL
      AND s.prompt_count > 0 AND s.started_at > ?
    GROUP BY c.topic
    HAVING sessions >= 5
    ORDER BY avg_sat ASC
  `).all(since) as Array<{ topic: string; sessions: number; avg_sat: number }>

  const intentSatisfaction = db.prepare(`
    SELECT dominant_intent AS intent, COUNT(*) AS sessions,
      ROUND(AVG(satisfaction_score)) AS avg_sat
    FROM sessions
    WHERE dominant_intent IS NOT NULL AND satisfaction_score IS NOT NULL
      AND prompt_count > 0 AND started_at > ?
    GROUP BY dominant_intent
    HAVING sessions >= 5
    ORDER BY avg_sat ASC
  `).all(since) as Array<{ intent: string; sessions: number; avg_sat: number }>

  // Session's hour bucket = bucket of its first prompt.
  const hourRows = db.prepare(`
    SELECT first_bucket AS bucket, COUNT(*) AS sessions,
      SUM(CASE WHEN outcome = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
      SUM(CASE WHEN outcome IS NOT NULL THEN 1 ELSE 0 END) AS decided
    FROM (
      SELECT s.session_id, s.outcome,
        (SELECT c.hour_bucket FROM contributions c
         WHERE c.session_id = s.session_id ORDER BY c.timestamp LIMIT 1) AS first_bucket
      FROM sessions s
      WHERE s.prompt_count > 0 AND s.started_at > ?
    )
    WHERE first_bucket IS NOT NULL
    GROUP BY first_bucket
  `).all(since) as Array<{ bucket: string; sessions: number; abandoned: number; decided: number }>

  const toolCutoff = Math.max(since, TOOL_RELIABILITY_CUTOFF_MS)
  const postCutoff = db.prepare(
    'SELECT COUNT(*) AS c FROM tool_events WHERE timestamp > ?'
  ).get(toolCutoff) as { c: number }
  const toolStats = db.prepare(`
    SELECT tool_name AS tool, COUNT(*) AS uses,
      ROUND(100.0 * SUM(success) / COUNT(*), 1) AS success_pct
    FROM tool_events
    WHERE timestamp > ?
    GROUP BY tool_name
    HAVING uses >= 20
    ORDER BY success_pct ASC
  `).all(toolCutoff) as Array<{ tool: string; uses: number; success_pct: number }>

  const sourceRows = db.prepare(`
    SELECT source, COUNT(*) AS sessions,
      ROUND(AVG(prompt_count), 1) AS avg_prompts,
      ROUND(AVG(tool_use_count), 1) AS avg_tools
    FROM sessions
    WHERE prompt_count > 0 AND started_at > ? AND source IN ('claude-code', 'codex')
    GROUP BY source
  `).all(since) as Array<{ source: string; sessions: number; avg_prompts: number; avg_tools: number }>

  const src = (name: string) => {
    const row = sourceRows.find(r => r.source === name)
    return row ? { sessions: row.sessions, avgPrompts: row.avg_prompts, avgTools: row.avg_tools } : null
  }

  return {
    windowDays: opts.days ?? null,
    promptedSessions: overall.sessions,
    totalPrompts: overall.prompts ?? 0,
    avgPromptsPerSession: Math.round((overall.avg_prompts ?? 0) * 10) / 10,
    avgSatisfaction: overall.avg_sat != null ? Math.round(overall.avg_sat) : null,
    completionPct: pct(overall.completed, overall.decided),
    abandonedPct: pct(overall.abandoned, overall.decided),
    errorPastePromptPct: pct(promptStats.error_paste, promptStats.total),
    debuggingPromptPct: pct(promptStats.debugging, promptStats.total),
    richPromptSessions: bySessionSample(richFilter),
    leanPromptSessions: bySessionSample(`NOT ${richFilter}`),
    toolUsingSessions: overall.tool_sessions,
    retryStormSessions: overall.retry_storm_sessions,
    over25PromptSessions: overall.over25,
    focusedSessions: bySessionSample('s.prompt_count <= 15'),
    marathonSessions: bySessionSample('s.prompt_count > 40'),
    minimalStyleSessions: bySessionSample(minimalFilter),
    fullStyleSessions: bySessionSample(`NOT ${minimalFilter}`),
    sessionsWithFailures: overall.failure_sessions,
    avgErrorRecoveryRate: overall.avg_recovery,
    topicSatisfaction: topicSatisfaction.map(r => ({ topic: r.topic, sessions: r.sessions, avgSatisfaction: r.avg_sat })),
    intentSatisfaction: intentSatisfaction.map(r => ({ intent: r.intent, sessions: r.sessions, avgSatisfaction: r.avg_sat })),
    hourAbandonment: hourRows.map(r => ({ bucket: r.bucket, sessions: r.sessions, abandonedPct: pct(r.abandoned, r.decided) })),
    subagentSessions: overall.subagent_sessions,
    planModeSessions: overall.plan_sessions,
    compactionThrashSessions: overall.compaction_thrash,
    postCutoffToolEvents: postCutoff.c,
    toolStats: toolStats.map(r => ({ tool: r.tool, uses: r.uses, successPct: r.success_pct })),
    sources: { claudeCode: src('claude-code'), codex: src('codex') },
  }
}

// ── Rules ────────────────────────────────────────────────

const INTENT_PHRASES: Record<string, string> = {
  debugging: 'debugging sessions',
  feature_build: 'sessions where you build new features',
  refactoring: 'refactoring sessions',
  learning: 'sessions where you learn something new',
  devops: 'infrastructure and deploy sessions',
  testing: 'testing sessions',
  documentation: 'documentation sessions',
  code_review: 'code review sessions',
  exploration: 'open-ended exploration sessions',
}

const HOUR_PHRASES: Record<string, string> = {
  morning: 'morning',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'late-night',
}

type Rule = (inputs: CoachInputs) => CoachFinding | null

const evidenceGap: Rule = (i) => {
  if (i.totalPrompts < 100) return null
  if (i.errorPastePromptPct >= 2 || i.debuggingPromptPct <= 20) return null
  const rich = i.richPromptSessions
  const lean = i.leanPromptSessions
  const contrast = rich.sessions >= 10 && lean.sessions >= 10 && rich.completionPct > lean.completionPct + 5
  return {
    id: 'evidence-gap',
    headline: 'You describe errors instead of pasting them',
    what_you_do: `A large share of your work is chasing bugs, but you almost never paste the actual error output into the conversation — you retype or summarize it instead.`,
    what_to_try: 'When something breaks, paste the full error message and stack trace verbatim. Copy-paste beats paraphrase: the exact text carries file paths, line numbers, and error codes you would otherwise drop.',
    payoff: contrast
      ? `Your own sessions show it: when you give detailed context, ${rich.completionPct}% of sessions finish the job, vs ${lean.completionPct}% when you keep it brief.`
      : 'The model can only fix what it can see — exact errors get exact fixes.',
    evidence: {
      'share of prompts that paste an error': `${i.errorPastePromptPct}%`,
      'share of prompts about debugging': `${i.debuggingPromptPct}%`,
      ...(contrast ? { 'finish rate with rich context vs without': `${rich.completionPct}% vs ${lean.completionPct}%` } : {}),
    },
    impact: 9 * (i.debuggingPromptPct / 100),
  }
}

const retryStorms: Rule = (i) => {
  if (i.toolUsingSessions < 20) return null
  const share = i.retryStormSessions / i.toolUsingSessions
  if (share < 0.2) return null
  return {
    id: 'retry-storms',
    headline: 'After the same tool fails twice, change approach',
    what_you_do: `In ${Math.round(share * 100)}% of your working sessions, the same tool fails three or more times in a row before anything changes.`,
    what_to_try: 'Two identical failures is the signal to stop and switch: ask for a different approach, read the file yourself, or say "that command keeps failing — try another way".',
    payoff: 'Breaking the loop early saves the minutes (and tokens) the third, fourth, and fifth identical failures would burn.',
    evidence: {
      'sessions with a repeated-failure loop': i.retryStormSessions,
      'share of tool-using sessions affected': `${Math.round(share * 100)}%`,
    },
    impact: 8 * share,
  }
}

const marathonSessions: Rule = (i) => {
  if (i.promptedSessions < 20) return null
  if (i.avgPromptsPerSession < 25) return null
  const focused = i.focusedSessions
  const marathon = i.marathonSessions
  const contrast = focused.sessions >= 10 && marathon.sessions >= 10 && focused.completionPct > marathon.completionPct + 5
  return {
    id: 'marathon-sessions',
    headline: 'Split work into focused sessions',
    what_you_do: `Your sessions average ${i.avgPromptsPerSession} messages each — long enough that early context gets buried and later answers drift.`,
    what_to_try: 'When a task is done, start a fresh session for the next one instead of continuing in place. One goal per session keeps every message working toward the same thing.',
    payoff: contrast
      ? `In your own data, short focused sessions finish ${focused.completionPct}% of the time vs ${marathon.completionPct}% for the longest ones.`
      : 'Shorter sessions keep the whole conversation relevant to the task at hand.',
    evidence: {
      'average messages per session': i.avgPromptsPerSession,
      'sessions with more than 25 messages': i.over25PromptSessions,
      ...(contrast ? { 'finish rate, short vs marathon sessions': `${focused.completionPct}% vs ${marathon.completionPct}%` } : {}),
    },
    impact: 7 * Math.min(1, i.over25PromptSessions / Math.max(1, i.promptedSessions)),
  }
}

const minimalPromptPenalty: Rule = (i) => {
  const minimal = i.minimalStyleSessions
  const full = i.fullStyleSessions
  if (minimal.sessions < 10 || full.sessions < 10) return null
  const satGap = (full.avgSatisfaction ?? 0) - (minimal.avgSatisfaction ?? 0)
  const completionGap = full.completionPct - minimal.completionPct
  if (satGap < 15 && completionGap < 15) return null
  const usesSat = satGap >= 15 && minimal.avgSatisfaction != null && full.avgSatisfaction != null
  return {
    id: 'minimal-prompt-penalty',
    headline: 'One-liner requests cost you finished work',
    what_you_do: 'A big slice of your sessions run mostly on very short messages — a sentence or less — and those sessions go measurably worse than the ones where you spell things out.',
    what_to_try: 'Spend thirty extra seconds on the opening message: what you want, where it lives, and what "done" looks like. The rest of the session inherits that clarity.',
    payoff: usesSat
      ? `Your detailed sessions score ${full.avgSatisfaction} vs ${minimal.avgSatisfaction} for terse ones — the single biggest lever in your data.`
      : `Your detailed sessions finish ${full.completionPct}% of the time vs ${minimal.completionPct}% for terse ones.`,
    evidence: {
      'sessions run mostly on one-liners': minimal.sessions,
      ...(usesSat
        ? { 'session quality, detailed vs terse': `${full.avgSatisfaction} vs ${minimal.avgSatisfaction}` }
        : { 'finish rate, detailed vs terse': `${full.completionPct}% vs ${minimal.completionPct}%` }),
    },
    impact: 8 * (minimal.sessions / Math.max(1, i.promptedSessions)),
  }
}

const lowErrorRecovery: Rule = (i) => {
  if (i.sessionsWithFailures < 15) return null
  if (i.avgErrorRecoveryRate == null || i.avgErrorRecoveryRate >= 0.5) return null
  const recoveredPct = Math.round(i.avgErrorRecoveryRate * 100)
  return {
    id: 'low-error-recovery',
    headline: 'Most failures never get a working follow-up',
    what_you_do: `When a tool call fails in your sessions, only about ${recoveredPct}% of those failures are followed by a successful retry — the rest just get left behind.`,
    what_to_try: 'When something fails, make the fix explicit: "that failed with X — fix the cause, then run it again". Don\'t let a failed step scroll away without a resolution.',
    payoff: 'Closing failure loops is the difference between a session that ships and one that quietly stalls.',
    evidence: {
      'sessions that hit at least one failure': i.sessionsWithFailures,
      'share of failures followed by a successful retry': `${recoveredPct}%`,
    },
    impact: 7 * (i.sessionsWithFailures / Math.max(1, i.promptedSessions)),
  }
}

const strugglingTopic: Rule = (i) => {
  if (i.avgSatisfaction == null) return null
  const worst = i.topicSatisfaction.find(t => t.sessions >= 10 && t.avgSatisfaction <= (i.avgSatisfaction ?? 0) - 15)
  if (!worst) return null
  return {
    id: 'struggling-topic',
    headline: `Your ${worst.topic} sessions go worse than everything else`,
    what_you_do: `Work that touches ${worst.topic} scores ${worst.avgSatisfaction} in your data, well below your usual ${i.avgSatisfaction}. Something about how those sessions start or unfold isn't working.`,
    what_to_try: `Next ${worst.topic} task, open with more context than feels necessary: paste the relevant config or code up front, state the constraint that usually bites you, and ask for a plan before any edits.`,
    payoff: `Closing even half the gap would lift a meaningful chunk of your week — ${worst.sessions} sessions touched ${worst.topic} in this period.`,
    evidence: {
      [`sessions touching ${worst.topic}`]: worst.sessions,
      'their score vs your average': `${worst.avgSatisfaction} vs ${i.avgSatisfaction}`,
    },
    impact: 6 * (worst.sessions / Math.max(1, i.promptedSessions)),
  }
}

const strugglingIntent: Rule = (i) => {
  if (i.avgSatisfaction == null) return null
  const worst = i.intentSatisfaction.find(t => t.sessions >= 10 && t.avgSatisfaction <= (i.avgSatisfaction ?? 0) - 15)
  if (!worst) return null
  const phrase = INTENT_PHRASES[worst.intent] ?? `${worst.intent} sessions`
  return {
    id: 'struggling-intent',
    headline: `Your ${phrase} end badly more often than the rest`,
    what_you_do: `Your ${phrase} score ${worst.avgSatisfaction} against your usual ${i.avgSatisfaction} — they fail, stall, or get abandoned more than any other kind of work you do.`,
    what_to_try: 'Treat that kind of session differently: smaller scope per session, more pasted context up front, and an explicit "verify it works before moving on" step.',
    payoff: `That's ${worst.sessions} sessions in this period — your biggest concentration of rough sessions.`,
    evidence: {
      'sessions of this kind': worst.sessions,
      'their score vs your average': `${worst.avgSatisfaction} vs ${i.avgSatisfaction}`,
    },
    impact: 6 * (worst.sessions / Math.max(1, i.promptedSessions)),
  }
}

const abandonmentCluster: Rule = (i) => {
  if (i.abandonedPct <= 0) return null
  const cluster = i.hourAbandonment.find(h => h.sessions >= 5 && h.abandonedPct >= 2 * i.abandonedPct && h.abandonedPct > 0)
  if (!cluster) return null
  const phrase = HOUR_PHRASES[cluster.bucket] ?? cluster.bucket
  return {
    id: 'abandonment-cluster',
    headline: `Your ${phrase} sessions rarely make it to the finish`,
    what_you_do: `Sessions you start in the ${phrase === 'late-night' ? 'late night' : cluster.bucket} get walked away from ${cluster.abandonedPct}% of the time — about ${Math.round(cluster.abandonedPct / Math.max(1, i.abandonedPct))}x your normal rate.`,
    what_to_try: `Keep ${phrase} sessions small and self-contained: one bug, one file, one question. Save the open-ended work for the hours where you actually finish things.`,
    payoff: 'Matching task size to the time of day turns your worst hours into cheap wins instead of abandoned threads.',
    evidence: {
      [`${cluster.bucket} sessions in this period`]: cluster.sessions,
      'abandoned then vs overall': `${cluster.abandonedPct}% vs ${i.abandonedPct}%`,
    },
    impact: 6 * (cluster.sessions / Math.max(1, i.promptedSessions)),
  }
}

const subagentsUntapped: Rule = (i) => {
  if (i.promptedSessions < 40) return null
  const share = i.subagentSessions / i.promptedSessions
  if (share >= 0.05) return null
  return {
    id: 'subagents-untapped',
    headline: 'You almost never delegate to subagents',
    what_you_do: `Only ${i.subagentSessions} of your ${i.promptedSessions} sessions used a subagent. Everything else runs through one conversation, one step at a time.`,
    what_to_try: 'When work fans out — search the codebase for X while checking Y, or investigate three files at once — ask for subagents explicitly: "use subagents to check these in parallel".',
    payoff: 'Parallel legwork comes back summarized instead of flooding your session, so long tasks finish in fewer of your messages.',
    evidence: {
      'sessions that used a subagent': i.subagentSessions,
      'sessions total': i.promptedSessions,
    },
    impact: 4 * (1 - share),
  }
}

const planModeUnused: Rule = (i) => {
  if (i.promptedSessions < 40) return null
  const share = i.planModeSessions / i.promptedSessions
  if (share >= 0.05) return null
  return {
    id: 'plan-mode-unused',
    headline: 'Big tasks start without a plan',
    what_you_do: `Almost none of your sessions (${i.planModeSessions} of ${i.promptedSessions}) start in plan mode — even the ones that turn into hours of edits.`,
    what_to_try: 'For anything that will touch more than a couple of files, hit shift+tab twice to enter plan mode first. You get a reviewable plan before any code changes, and you can redirect it cheaply.',
    payoff: 'A two-minute plan review is much cheaper than unwinding an hour of edits that went the wrong direction.',
    evidence: {
      'sessions started in plan mode': i.planModeSessions,
      'sessions total': i.promptedSessions,
    },
    impact: 3 * (1 - share),
  }
}

const compactionThrash: Rule = (i) => {
  if (i.promptedSessions < 20 || i.compactionThrashSessions < 5) return null
  const share = i.compactionThrashSessions / i.promptedSessions
  if (share < 0.1) return null
  return {
    id: 'compaction-thrash',
    headline: 'Your sessions keep outgrowing their memory',
    what_you_do: `${i.compactionThrashSessions} sessions ran so long the conversation had to be compressed twice or more — each squeeze loses detail from earlier in the session.`,
    what_to_try: 'When you see the context getting compacted, treat it as a checkpoint: summarize where things stand, start a fresh session, and paste the summary in.',
    payoff: 'A fresh session with a good summary remembers more than an old session that has been squeezed twice.',
    evidence: {
      'sessions compressed 2+ times': i.compactionThrashSessions,
      'share of sessions affected': `${Math.round(share * 100)}%`,
    },
    impact: 5 * share,
  }
}

const toolTrouble: Rule = (i) => {
  if (i.postCutoffToolEvents < 50) return null
  const worst = i.toolStats.find(t => t.uses >= 20 && t.successPct < 60)
  if (!worst) return null
  return {
    id: 'tool-trouble',
    headline: `${worst.tool} keeps failing on you`,
    what_you_do: `${worst.tool} succeeded only ${worst.successPct}% of the time across ${worst.uses} recent uses — when it fails repeatedly the session usually stalls with it.`,
    what_to_try: `When ${worst.tool} fails twice on the same thing, say so and ask for a different route to the same result instead of letting it retry.`,
    payoff: 'Rerouting around a flaky tool keeps the session moving instead of grinding on the same failure. (Based only on tool calls after Aug 5, 2026 — earlier success rates were unreliable.)',
    evidence: {
      [`${worst.tool} success rate`]: `${worst.successPct}%`,
      [`${worst.tool} recent uses`]: worst.uses,
    },
    impact: 7 * (worst.uses / Math.max(1, i.postCutoffToolEvents)),
  }
}

const twoAgentImbalance: Rule = (i) => {
  const cc = i.sources.claudeCode
  const cx = i.sources.codex
  if (!cc || !cx || cc.sessions < 10 || cx.sessions < 10) return null
  const verbose = cc.avgPrompts >= cx.avgPrompts ? { name: 'Claude Code', s: cc } : { name: 'Codex', s: cx }
  const autonomous = verbose.name === 'Claude Code' ? { name: 'Codex', s: cx } : { name: 'Claude Code', s: cc }
  if (verbose.s.avgPrompts < autonomous.s.avgPrompts * 2) return null
  return {
    id: 'two-agent-imbalance',
    headline: `You drive ${verbose.name} by hand and let ${autonomous.name} run`,
    what_you_do: `Your ${verbose.name} sessions average ${verbose.s.avgPrompts} messages of back-and-forth, while ${autonomous.name} sessions average ${autonomous.s.avgPrompts} — two very different working styles.`,
    what_to_try: `Worth noticing which style fits which work: the hands-on sessions suit exploratory tasks, the hands-off ones suit well-specified tasks. Route accordingly.`,
    payoff: '',
    evidence: {
      [`${verbose.name} messages per session`]: verbose.s.avgPrompts,
      [`${autonomous.name} messages per session`]: autonomous.s.avgPrompts,
      [`${verbose.name} sessions`]: verbose.s.sessions,
      [`${autonomous.name} sessions`]: autonomous.s.sessions,
    },
    impact: 2 * Math.min(1, cx.sessions / Math.max(1, i.promptedSessions)),
  }
}

const RULES: Rule[] = [
  evidenceGap,
  retryStorms,
  marathonSessions,
  minimalPromptPenalty,
  lowErrorRecovery,
  strugglingTopic,
  strugglingIntent,
  abandonmentCluster,
  subagentsUntapped,
  planModeUnused,
  compactionThrash,
  toolTrouble,
  twoAgentImbalance,
]

/** Pure: evaluate every rule against gathered inputs, ranked by impact desc. */
export function evaluateCoachRules(inputs: CoachInputs): CoachFinding[] {
  const findings: CoachFinding[] = []
  for (const rule of RULES) {
    try {
      const finding = rule(inputs)
      if (finding) findings.push({ ...finding, impact: Math.round(finding.impact * 100) / 100 })
    } catch {
      // one broken rule must never take down the brief
    }
  }
  return findings.sort((a, b) => b.impact - a.impact)
}

/** Minimum prompted sessions before a time window is considered representative. */
export const MIN_WINDOW_SESSIONS = 40

/**
 * Gather + evaluate with a widen fallback: if the requested window holds too
 * few prompted sessions to say anything responsible, fall back to all-time.
 */
export function computeCoachFindings(
  db: Database.Database,
  opts: { days?: number; now?: number } = {},
): { inputs: CoachInputs; findings: CoachFinding[] } {
  let inputs = gatherCoachInputs(db, { days: opts.days ?? 7, now: opts.now })
  if (inputs.promptedSessions < MIN_WINDOW_SESSIONS) {
    const allTime = gatherCoachInputs(db, { days: null, now: opts.now })
    if (allTime.promptedSessions > inputs.promptedSessions) inputs = allTime
  }
  return { inputs, findings: evaluateCoachRules(inputs) }
}
