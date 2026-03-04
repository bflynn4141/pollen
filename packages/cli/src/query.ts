import type { IntentRow, LangRow, Stats, TimeRow, TrendRow, ToolFrequencyRow, ToolPairRow, ToolFailureRow, SessionSummaryRow, SessionArcRow, McpServerRow, ProjectTypeRow, ToolTripleRow, TopicRow, ActionRow, ActionTopicRow, TopicSatisfactionRow, SatisfactionByIntentRow, SatisfactionOverviewRow } from './store.js'

export function bar(ratio: number, width = 20): string {
  const filled = Math.round(ratio * width)
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled)
}

export function renderStats(stats: Stats): string {
  if (stats.total === 0) return 'No data yet. Use Claude Code with the hook active to start collecting.\n'

  const first = stats.firstSeen ? new Date(stats.firstSeen).toLocaleDateString() : 'unknown'
  const last = stats.lastSeen ? new Date(stats.lastSeen).toLocaleDateString() : 'unknown'

  return [
    'Pollen Stats',
    '============',
    `Total prompts:    ${stats.total}`,
    `Unique sessions:  ${stats.uniqueSessions}`,
    `First seen:       ${first}`,
    `Last seen:        ${last}`,
    '',
  ].join('\n')
}

export function renderIntents(intents: IntentRow[]): string {
  if (intents.length === 0) return 'No data yet.\n'

  const total = intents.reduce((sum, r) => sum + r.count, 0)
  const lines = intents.map(r => {
    const pct = ((r.count / total) * 100).toFixed(0).padStart(3)
    const b = bar(r.count / total)
    return `  ${r.intent.padEnd(16)} ${pct}%  ${b}  (${r.count})`
  })

  return ['Intent Distribution', '===================', ...lines, ''].join('\n')
}

export function renderLanguages(languages: LangRow[]): string {
  if (languages.length === 0) return 'No language data yet.\n'

  const total = languages.reduce((sum, r) => sum + r.count, 0)
  const lines = languages.map(r => {
    const pct = ((r.count / total) * 100).toFixed(0).padStart(3)
    const b = bar(r.count / total)
    return `  ${r.language.padEnd(16)} ${pct}%  ${b}  (${r.count})`
  })

  return ['Languages', '=========', ...lines, ''].join('\n')
}

export function renderWhen(patterns: { byHour: TimeRow[]; byDay: TimeRow[] }): string {
  if (patterns.byHour.length === 0) return 'No time data yet.\n'

  const peak = patterns.byHour[0]
  const peakDay = patterns.byDay[0]

  const hourTotal = patterns.byHour.reduce((sum, r) => sum + r.count, 0)
  const hourLines = patterns.byHour.map(r => {
    const pct = ((r.count / hourTotal) * 100).toFixed(0).padStart(3)
    const b = bar(r.count / hourTotal)
    return `  ${r.bucket.padEnd(12)} ${pct}%  ${b}  (${r.count})`
  })

  return [
    'Time Patterns',
    '=============',
    `  Peak hours:       ${peak.bucket} (${peak.count} prompts)`,
    `  Most active day:  ${peakDay.bucket}`,
    '',
    'By time of day:',
    ...hourLines,
    '',
  ].join('\n')
}

export function renderTrends(trends: TrendRow[]): string {
  if (trends.length === 0) return 'No trend data yet.\n'

  const max = Math.max(...trends.map(r => r.count))
  const lines = trends.map(r => {
    const b = bar(r.count / max, 30)
    return `  ${r.date}  ${b}  ${r.count}`
  })

  return ['Trends', '======', ...lines, ''].join('\n')
}

// --- New tool intelligence renders ---

export function renderToolFrequency(tools: ToolFrequencyRow[]): string {
  if (tools.length === 0) return 'No tool usage data yet. Tool events are captured via PostToolUse hooks.\n'

  const total = tools.reduce((sum, r) => sum + r.count, 0)
  const lines = tools.map(r => {
    const pct = ((r.count / total) * 100).toFixed(0).padStart(3)
    const b = bar(r.count / total)
    const rate = r.count > 0 ? ((r.success_count / r.count) * 100).toFixed(0) : '0'
    return `  ${r.tool_name.padEnd(20)} ${pct}%  ${b}  ${r.count} uses  (${rate}% ok)`
  })

  return ['Tool Frequency (from actual usage)', '===================================', ...lines, ''].join('\n')
}

export function renderToolPairs(pairs: ToolPairRow[]): string {
  if (pairs.length === 0) return 'No tool flow data yet.\n'

  const maxCount = pairs[0].count
  const lines = pairs.slice(0, 15).map(r => {
    const b = bar(r.count / maxCount, 15)
    return `  ${r.tool_a.padEnd(16)} \u2192 ${r.tool_b.padEnd(16)} ${b}  ${r.count}`
  })

  return ['Tool Flows (deduped pairs, no self-loops)', '==========================================', ...lines, ''].join('\n')
}

export function renderToolTriples(triples: ToolTripleRow[]): string {
  if (triples.length === 0) return 'No 3-step flow data yet.\n'

  const maxCount = triples[0].count
  const lines = triples.slice(0, 15).map(r => {
    const b = bar(r.count / maxCount, 15)
    return `  ${r.tool_a.padEnd(12)} \u2192 ${r.tool_b.padEnd(12)} \u2192 ${r.tool_c.padEnd(12)} ${b}  ${r.count}`
  })

  return ['Tool Flows (3-step, deduped)', '============================', ...lines, ''].join('\n')
}

export function renderToolFailures(failures: ToolFailureRow[]): string {
  if (failures.length === 0) return 'No tool failures recorded.\n'

  const lines = failures.map(r => {
    return `  ${r.tool_name.padEnd(16)} ${r.error_category.padEnd(16)} ${r.count}`
  })

  return ['Tool Failures', '=============', `  ${'Tool'.padEnd(16)} ${'Error Type'.padEnd(16)} Count`, ...lines, ''].join('\n')
}

export function renderSessionSummaries(sessions: SessionSummaryRow[]): string {
  if (sessions.length === 0) return 'No session data yet. Sessions are tracked via SessionStart/SessionEnd hooks.\n'

  const lines = sessions.map(r => {
    const start = new Date(r.started_at).toLocaleString()
    const duration = r.duration_bucket ?? 'active'
    const intent = r.dominant_intent ?? '-'
    const outcome = r.outcome ?? 'active'
    return `  ${start}  ${duration.padEnd(10)} ${intent.padEnd(16)} ${String(r.prompt_count).padStart(3)}p ${String(r.tool_use_count).padStart(4)}t  ${outcome}`
  })

  return [
    'Recent Sessions',
    '===============',
    `  ${'Started'.padEnd(22)}  ${'Duration'.padEnd(10)} ${'Intent'.padEnd(16)} Prompts Tools  Outcome`,
    ...lines,
    '',
  ].join('\n')
}

export function renderSessionArcs(arcs: SessionArcRow[]): string {
  if (arcs.length === 0) return 'No session arcs yet.\n'

  const total = arcs.reduce((sum, r) => sum + r.count, 0)
  const lines = arcs.map(r => {
    const pct = ((r.count / total) * 100).toFixed(0).padStart(3)
    const b = bar(r.count / total)
    return `  ${r.dominant_intent.padEnd(16)} \u2192 ${r.outcome.padEnd(12)} ${pct}%  ${b}  (${r.count})`
  })

  return ['Session Arcs (intent \u2192 outcome)', '================================', ...lines, ''].join('\n')
}

export function renderMcpServers(servers: McpServerRow[]): string {
  if (servers.length === 0) return 'No MCP server usage data yet. Use MCP tools to start tracking.\n'

  const total = servers.reduce((sum, r) => sum + r.call_count, 0)
  const lines = servers.map(r => {
    const pct = ((r.call_count / total) * 100).toFixed(0).padStart(3)
    const b = bar(r.call_count / total)
    const rate = r.call_count > 0 ? ((r.success_count / r.call_count) * 100).toFixed(0) : '0'
    return `  ${r.mcp_server.padEnd(20)} ${pct}%  ${b}  ${r.call_count} calls  (${rate}% ok)  ${r.unique_sessions} sessions`
  })

  return [
    'MCP Server Usage',
    '================',
    `  ${'Server'.padEnd(20)} Share  ${''.padEnd(20)}  Calls   Success   Sessions`,
    ...lines,
    '',
  ].join('\n')
}

export function renderProjects(projects: ProjectTypeRow[]): string {
  if (projects.length === 0) return 'No project type data yet. Project types are detected on SessionStart.\n'

  const total = projects.reduce((sum, r) => sum + r.session_count, 0)
  const lines = projects.map(r => {
    const pct = ((r.session_count / total) * 100).toFixed(0).padStart(3)
    const b = bar(r.session_count / total)
    return `  ${r.project_type.padEnd(16)} ${pct}%  ${b}  (${r.session_count} sessions)`
  })

  return ['Project Types', '=============', ...lines, ''].join('\n')
}

// --- Topic & Satisfaction renders ---

export function renderTopics(topics: TopicRow[], actions: ActionRow[], combos: ActionTopicRow[], topicSat: TopicSatisfactionRow[]): string {
  const sections: string[] = []

  // Topics by volume
  if (topics.length > 0) {
    const total = topics.reduce((sum, r) => sum + r.count, 0)
    const satMap = new Map(topicSat.map(r => [r.topic, r.avg_satisfaction]))
    const lines = topics.map(r => {
      const pct = ((r.count / total) * 100).toFixed(0).padStart(3)
      const b = bar(r.count / total)
      const sat = satMap.get(r.topic)
      const satStr = sat != null ? `  ${sat}/100` : ''
      return `  ${r.topic.padEnd(16)} ${pct}%  ${b}  (${r.count})${satStr}`
    })
    sections.push(['What people work on', '===================', ...lines, ''].join('\n'))
  } else {
    sections.push('No topic data yet. Topics are extracted from prompts.\n')
  }

  // Actions by volume
  if (actions.length > 0) {
    const total = actions.reduce((sum, r) => sum + r.count, 0)
    const lines = actions.map(r => {
      const pct = ((r.count / total) * 100).toFixed(0).padStart(3)
      const b = bar(r.count / total)
      return `  ${r.action.padEnd(16)} ${pct}%  ${b}  (${r.count})`
    })
    sections.push(['What people try to do', '=====================', ...lines, ''].join('\n'))
  }

  // Top action+topic combinations
  if (combos.length > 0) {
    const maxCount = combos[0].count
    const lines = combos.slice(0, 15).map(r => {
      const b = bar(r.count / maxCount, 15)
      return `  ${r.action.padEnd(12)} ${r.topic.padEnd(14)} ${b}  ${r.count}`
    })
    sections.push(['Top action + topic combinations', '===============================', `  ${'Action'.padEnd(12)} ${'Topic'.padEnd(14)} ${''.padEnd(15)}  Count`, ...lines, ''].join('\n'))
  }

  return sections.join('\n')
}

export function renderSatisfaction(overview: SatisfactionOverviewRow, byIntent: SatisfactionByIntentRow[]): string {
  const sections: string[] = []

  if (overview.scored_sessions === 0) {
    return 'No satisfaction data yet. Scores are computed when sessions end.\n'
  }

  // Overview
  const scorePct = overview.avg_score / 100
  const scoreBar = bar(scorePct)
  sections.push([
    'Session Satisfaction',
    '====================',
    `  Overall: ${overview.avg_score}/100  ${scoreBar}`,
    `  Scored:  ${overview.scored_sessions} of ${overview.total_sessions} sessions`,
    '',
  ].join('\n'))

  // By intent
  if (byIntent.length > 0) {
    const lines = byIntent.map(r => {
      const b = bar(r.avg_satisfaction / 100)
      return `  ${r.dominant_intent.padEnd(16)} ${String(r.avg_satisfaction).padStart(3)}/100  ${b}  (${r.session_count} sessions)`
    })
    sections.push(['By Intent', '---------', ...lines, ''].join('\n'))
  }

  // Signal breakdown
  if (Object.keys(overview.signal_counts).length > 0) {
    const total = overview.scored_sessions
    const signalLabels: Record<string, string> = {
      git_activity: 'Git activity',
      low_failure_rate: 'Low failure rate',
      no_retry_storms: 'No retry storms',
      reasonable_duration: 'Good duration',
      tool_engagement: 'Tool engagement',
      consistent_intent: 'Consistent intent',
      clean_ending: 'Clean ending',
    }
    const lines = Object.entries(overview.signal_counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => {
        const label = signalLabels[key] ?? key
        const pct = ((count / total) * 100).toFixed(0).padStart(3)
        const b = bar(count / total)
        return `  ${label.padEnd(20)} ${pct}%  ${b}  (${count}/${total})`
      })
    sections.push(['Signals', '-------', ...lines, ''].join('\n'))
  }

  return sections.join('\n')
}
