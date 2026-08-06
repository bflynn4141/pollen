/**
 * Pollen Brief — weekly, top-3, plain-language coaching digest.
 *
 * Pipeline: coach rules → top 3 findings → compact privacy-safe summary →
 * optional Claude polish (COACH_MODEL; template fallback when no API key) →
 * self-contained HTML one-pager + plain-text version.
 *
 * Privacy: the summary sent to the API (and embedded in the email) contains
 * ONLY aggregates and rule-generated card text — no prompt text, subjects,
 * file paths, or contributor ids.
 */
import Anthropic from '@anthropic-ai/sdk'
import type Database from 'better-sqlite3'
import { HEAT_RAMP, computeActivity } from './activity.js'
import type { ActivityDay, ActivitySummary } from './activity.js'
import { COACH_MODEL } from './config.js'
import {
  computeCoachFindings, type CoachFinding, type CoachInputs,
} from './coach-rules.js'

// ── ISO week helper ─────────────────────────────────────

/** ISO 8601 week id, e.g. "2026-W32" */
export function isoWeekOf(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day) // nearest Thursday decides the ISO year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// ── Summary ─────────────────────────────────────────────

export interface BriefSummary {
  week: string
  window: string
  sessions: number
  prompts: number
  avg_messages_per_session: number
  finish_rate_pct: number
  avg_session_score: number | null
  cards: CoachFinding[]
}

/** Compact JSON handed to the polish model and embedded in renders. */
export function buildBriefSummary(inputs: CoachInputs, findings: CoachFinding[]): BriefSummary {
  return {
    week: isoWeekOf(),
    window: inputs.windowDays != null ? `last ${inputs.windowDays} days` : 'all recorded sessions',
    sessions: inputs.promptedSessions,
    prompts: inputs.totalPrompts,
    avg_messages_per_session: inputs.avgPromptsPerSession,
    finish_rate_pct: inputs.completionPct,
    avg_session_score: inputs.avgSatisfaction,
    cards: findings.slice(0, 3),
  }
}

// ── Optional Claude polish ──────────────────────────────

export interface PolishedBrief {
  intro: string
  cards: Array<{ id: string; prose: string }>
}

const POLISH_SYSTEM =
  'You are the voice of Pollen Brief, a weekly coaching digest for a developer who uses AI coding agents. ' +
  'You receive a JSON summary: aggregate stats plus up to 3 coaching cards (headline, what_you_do, what_to_try, payoff, evidence). ' +
  'Write warm, direct, second-person prose. No jargon, no metric names, no bullet lists, no emoji. ' +
  'Numbers only as plain evidence ("79% vs 22%"). Never invent numbers not present in the input.\n\n' +
  'Respond with ONLY a JSON object, no markdown fences:\n' +
  '{"intro": "<exactly 2 sentences summarizing the week in plain language>", ' +
  '"cards": [{"id": "<card id>", "prose": "<2-4 sentences merging what_you_do, what_to_try and payoff into flowing advice>"}]}'

/**
 * Polish the brief with Claude. Returns null (caller falls back to template
 * rendering) when: no API key, refusal stop reason, or any error.
 */
export async function polishBrief(
  summary: BriefSummary,
  clientFactory?: () => Pick<Anthropic, 'messages'>,
): Promise<PolishedBrief | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey && !clientFactory) return null

  try {
    const client = clientFactory ? clientFactory() : new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: COACH_MODEL,
      max_tokens: 1200,
      system: POLISH_SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(summary) }],
    })
    // Newer models can decline with stop_reason 'refusal'; the installed SDK's
    // union predates it, hence the widening cast.
    if ((response.stop_reason as string | null) === 'refusal') return null
    const block = response.content[0]
    if (!block || block.type !== 'text') return null
    const text = block.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
    const parsed = JSON.parse(text) as PolishedBrief
    if (typeof parsed.intro !== 'string' || !Array.isArray(parsed.cards)) return null
    return parsed
  } catch {
    return null
  }
}

// ── Rendering ───────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function templateIntro(summary: BriefSummary): string {
  const score = summary.avg_session_score != null ? ` and scored ${summary.avg_session_score} out of 100 on average` : ''
  return `You ran ${summary.sessions} working sessions (${summary.prompts.toLocaleString()} messages) across ${summary.window}. ` +
    `${summary.finish_rate_pct}% of them finished what they set out to do${score} — here are the three changes with the biggest payoff.`
}

function cardProse(card: CoachFinding, polished?: PolishedBrief | null): string {
  const match = polished?.cards.find(c => c.id === card.id)
  if (match?.prose) return match.prose
  return [card.what_you_do, card.what_to_try, card.payoff].filter(Boolean).join(' ')
}

export interface RenderedBrief {
  html: string
  text: string
  subject: string
  polish: 'claude' | 'template'
}

export function renderBrief(
  summary: BriefSummary,
  polished: PolishedBrief | null,
  activity?: ActivitySummary,
): RenderedBrief {
  const intro = polished?.intro ?? templateIntro(summary)
  const cards = summary.cards
  const weekNo = summary.week.split('-W')[1] ?? summary.week
  const subject = `Pollen brief — week ${weekNo}: ${cards[0]?.headline ?? 'your week with Claude Code'}`

  // GitHub-style neutral palette: grays carry the page, one green family
  // carries activity magnitude (sequential, lightness-monotonic ramp).
  // Deliberately no warm accents and no uppercase anywhere.
  const c = {
    bg: '#ffffff', card: '#ffffff', line: '#d0d7de', lineSoft: '#eaeef2',
    text: '#1f2328', muted: '#59636e', green: '#1a7f37',
  }

  const statTile = (value: string, label: string) =>
    `<td style="padding:0 28px 0 0;"><div style="font-size:22px; font-weight:600; color:${c.text}; line-height:1.2;">${escapeHtml(value)}</div><div style="font-size:13px; color:${c.muted};">${escapeHtml(label)}</div></td>`

  let activityHtml = ''
  if (activity && activity.totalDays > 0) {
    const cell = (day: ActivityDay | null) => {
      if (day === null) return `<td style="width:11px; height:11px;"></td>`
      const fill = HEAT_RAMP[day.level]
      const title = `${day.date} · ${day.prompts} prompt${day.prompts === 1 ? '' : 's'}`
      return `<td title="${escapeHtml(title)}" style="width:11px; height:11px; background:${fill}; border-radius:2px;"></td>`
    }
    // weeks are columns; render 7 weekday rows, Monday first
    const rows = Array.from({ length: 7 }, (_, dow) =>
      `<tr>${activity.weeks.map(week => cell(week[dow])).join('')}</tr>`
    ).join('')
    const legendCells = HEAT_RAMP
      .map(fill => `<td style="width:11px; height:11px; background:${fill}; border-radius:2px;"></td>`)
      .join('')
    activityHtml = `
    <div style="border:1px solid ${c.line}; border-radius:8px; padding:18px 20px; margin:0 0 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate; margin-bottom:14px;"><tr>
        ${statTile(String(activity.currentStreak), activity.currentStreak === 1 ? 'day current streak' : 'days current streak')}
        ${statTile(String(activity.longestStreak), 'days longest streak')}
        ${statTile(`${activity.activeDays}/${activity.totalDays}`, 'days active')}
      </tr></table>
      <table role="presentation" cellpadding="0" cellspacing="3" style="border-collapse:separate;">${rows}</table>
      <table role="presentation" cellpadding="0" cellspacing="3" style="border-collapse:separate; margin-top:8px;"><tr>
        <td style="font-size:12px; color:${c.muted}; padding-right:5px;">less</td>${legendCells}<td style="font-size:12px; color:${c.muted}; padding-left:5px;">more</td>
      </tr></table>
    </div>`
  }

  const cardHtml = cards.map((card, idx) => {
    const evidenceRows = Object.entries(card.evidence)
      .map(([k, v]) => `<tr><td style="padding:7px 16px 7px 0; font-size:13px; color:${c.muted}; border-top:1px solid ${c.lineSoft};">${escapeHtml(k)}</td><td style="padding:7px 0; font-size:13px; font-weight:600; color:${c.text}; border-top:1px solid ${c.lineSoft}; text-align:right;">${escapeHtml(String(v))}</td></tr>`)
      .join('')
    return `
      <div style="border:1px solid ${c.line}; border-radius:8px; padding:20px 22px; margin:0 0 14px;">
        <h2 style="margin:0 0 8px; font-size:17px; line-height:1.35; color:${c.text};"><span style="color:${c.green}; padding-right:8px;">${idx + 1}.</span>${escapeHtml(card.headline)}</h2>
        <p style="margin:0 0 12px; font-size:14px; line-height:1.6; color:${c.text};">${escapeHtml(cardProse(card, polished))}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%;">${evidenceRows}</table>
      </div>`
  }).join('')

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0; padding:0; background:${c.bg}; font-family:-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <div style="max-width:640px; margin:0 auto; padding:32px 20px;">
    <div style="margin-bottom:20px;">
      <h1 style="margin:0 0 2px; font-size:21px; color:${c.text};">🐝 Pollen brief</h1>
      <div style="font-size:14px; color:${c.muted};">Week ${escapeHtml(weekNo)} · ${escapeHtml(summary.window)}</div>
    </div>
    <p style="font-size:15px; line-height:1.65; color:${c.text}; margin:0 0 20px;">${escapeHtml(intro)}</p>
    ${activityHtml}
    ${cardHtml || `<div style="border:1px solid ${c.line}; border-radius:8px; padding:20px 22px;"><p style="margin:0; color:${c.text};">Not enough recorded sessions yet to say anything useful — keep working and next week's brief will have teeth.</p></div>`}
    <div style="margin-top:22px; padding-top:14px; border-top:1px solid ${c.lineSoft}; font-size:12px; color:${c.muted}; line-height:1.7;">
      Based on ${summary.sessions} sessions · ${summary.prompts.toLocaleString()} prompts · computed locally from your own usage data<br>
      🐝 pollen — nothing in this brief left your machine except this email
    </div>
  </div>
</body>
</html>`

  const textCards = cards.map((card, idx) =>
    `${idx + 1}. ${card.headline}\n\n${cardProse(card, polished)}\n\n   ${Object.entries(card.evidence).map(([k, v]) => `${k}: ${v}`).join(' · ')}`
  ).join('\n\n')

  const streakLine = activity && activity.totalDays > 0
    ? `Current streak ${activity.currentStreak} days · longest ${activity.longestStreak} · active ${activity.activeDays}/${activity.totalDays} days\n\n`
    : ''
  const text = [
    `Pollen brief — ${summary.week} (${summary.window})`,
    '',
    streakLine.trimEnd(),
    intro,
    '',
    textCards || 'Not enough recorded sessions yet to say anything useful.',
    '',
    `Based on ${summary.sessions} sessions and ${summary.prompts.toLocaleString()} prompts, computed locally.`,
  ].join('\n')

  return { html, text, subject, polish: polished ? 'claude' : 'template' }
}

// ── Orchestrator ────────────────────────────────────────

export interface BriefResult extends RenderedBrief {
  summary: BriefSummary
  findings: CoachFinding[]
}

export async function generateBrief(
  db: Database.Database,
  opts: { days?: number; polishFactory?: () => Pick<Anthropic, 'messages'> } = {},
): Promise<BriefResult> {
  const { inputs, findings } = computeCoachFindings(db, { days: opts.days ?? 7 })
  const top3 = findings.slice(0, 3)
  const summary = buildBriefSummary(inputs, top3)
  const polished = await polishBrief(summary, opts.polishFactory)
  const activity = computeActivity(db)
  const rendered = renderBrief(summary, polished, activity)
  return { ...rendered, summary, findings: top3 }
}
