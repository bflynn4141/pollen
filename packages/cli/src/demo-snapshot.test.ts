import { describe, expect, it } from 'vitest'
import {
  DEMO_SNAPSHOT_NOW,
  buildPersonalDemoSnapshot,
} from './demo-snapshot.js'

describe('buildPersonalDemoSnapshot', () => {
  it('is deterministic and internally consistent', () => {
    const first = buildPersonalDemoSnapshot(DEMO_SNAPSHOT_NOW)
    const second = buildPersonalDemoSnapshot(DEMO_SNAPSHOT_NOW)

    expect(second).toEqual(first)
    expect(first.schemaVersion).toBe(1)
    expect(first.provenance).toBe('synthetic')
    expect(first.period.timezone).toBe('UTC')
    expect(first.period.end).toBe('2026-08-07')
    expect(first.summary.sessions).toBe(42)
    expect(first.summary.prompts).toBeGreaterThan(200)
    expect(first.summary.toolCalls).toBeGreaterThan(200)

    expect(first.intents.reduce((sum, intent) => sum + intent.count, 0))
      .toBe(first.summary.prompts)
    expect(first.activity.weeks.flat().reduce(
      (sum, day) => sum + (day?.prompts ?? 0),
      0,
    )).toBe(first.summary.prompts)
    expect(first.tools.reduce((sum, tool) => sum + tool.count, 0))
      .toBe(first.summary.toolCalls)
  })

  it('runs the real coaching rules over the synthetic sessions', () => {
    const snapshot = buildPersonalDemoSnapshot(DEMO_SNAPSHOT_NOW)

    expect(snapshot.insights.map(insight => insight.id)).toEqual([
      'minimal-prompt-penalty',
      'retry-storms',
      'evidence-gap',
    ])
    for (const insight of snapshot.insights) {
      expect(insight.headline.length).toBeGreaterThan(10)
      expect(Object.keys(insight.evidence).length).toBeGreaterThan(0)
    }
  })

  it('emits aggregate-only output with no row identifiers or raw telemetry', () => {
    const serialized = JSON.stringify(buildPersonalDemoSnapshot(DEMO_SNAPSHOT_NOW))

    for (const forbidden of [
      'session_id',
      'contributor_id',
      'subject',
      'transcript_path',
      'response_summary',
      'prompt_text',
      'cwd',
      'synthetic-session-',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})
