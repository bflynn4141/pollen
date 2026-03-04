import {
  initDb, getStats,
  queryIntentDistribution, queryLanguageDistribution,
  queryTimePatterns, queryTrends,
  queryToolFrequency, queryToolPairs, queryToolFailures, queryToolTriples,
  querySessionSummaries, querySessionArcs,
  queryMcpServerUsage, queryProjectDistribution,
  queryTopicDistribution, queryActionDistribution, queryActionTopicCombinations, queryTopicSatisfaction,
  querySatisfactionByIntent, querySatisfactionOverview,
} from './store.js'
import {
  renderStats, renderIntents, renderLanguages, renderWhen, renderTrends,
  renderToolFrequency, renderToolPairs, renderToolFailures, renderToolTriples,
  renderSessionSummaries, renderSessionArcs,
  renderMcpServers, renderProjects,
  renderTopics, renderSatisfaction,
} from './query.js'
import { syncToNeon } from './sync.js'
import { backfillSubjects } from './backfill-subjects.js'
import { DB_PATH } from './config.js'

function openDb() {
  try {
    return initDb(DB_PATH)
  } catch {
    console.error('No pollen data found. Use Claude Code with the hook active to start collecting.')
    process.exit(1)
  }
}

const command = process.argv[2]

const db = openDb()

;(async () => {
try {
  switch (command) {
    case 'stats':
      console.log(renderStats(getStats(db)))
      break
    case 'intents':
      console.log(renderIntents(queryIntentDistribution(db)))
      break
    case 'languages':
      console.log(renderLanguages(queryLanguageDistribution(db)))
      break
    case 'tools':
      console.log(renderToolFrequency(queryToolFrequency(db)))
      break
    case 'flows':
      console.log(renderToolPairs(queryToolPairs(db)))
      console.log(renderToolTriples(queryToolTriples(db)))
      console.log(renderToolFailures(queryToolFailures(db)))
      break
    case 'mcp':
      console.log(renderMcpServers(queryMcpServerUsage(db)))
      break
    case 'projects':
      console.log(renderProjects(queryProjectDistribution(db)))
      break
    case 'topics':
      console.log(renderTopics(
        queryTopicDistribution(db),
        queryActionDistribution(db),
        queryActionTopicCombinations(db),
        queryTopicSatisfaction(db),
      ))
      break
    case 'satisfaction':
      console.log(renderSatisfaction(
        querySatisfactionOverview(db),
        querySatisfactionByIntent(db),
      ))
      break
    case 'sessions':
      console.log(renderSessionSummaries(querySessionSummaries(db)))
      console.log(renderSessionArcs(querySessionArcs(db)))
      break
    case 'when':
      console.log(renderWhen(queryTimePatterns(db)))
      break
    case 'trends': {
      const days = parseInt(process.argv[3] ?? '7', 10)
      console.log(renderTrends(queryTrends(db, days)))
      break
    }
    case 'sync': {
      const connStr = process.env.NEON_DATABASE_URL
      if (!connStr) {
        console.error('Set NEON_DATABASE_URL to sync. Example:')
        console.error('  export NEON_DATABASE_URL="postgresql://..."')
        process.exit(1)
      }
      console.log('Syncing to Neon...')
      const result = await syncToNeon(db, connStr)
      console.log(`Synced: ${result.contributions} contributions, ${result.tool_events} tool_events, ${result.sessions} sessions`)
      break
    }
    case 'backfill-subjects': {
      console.log('Backfilling session subjects via Haiku...')
      const result = await backfillSubjects(db)
      console.log(`Done: ${result.filled} filled, ${result.skipped} skipped (${result.total} total)`)
      break
    }
    case 'my': {
      const { render } = await import('ink')
      const { MyApp } = await import('./ui/MyApp.js')
      const { createElement } = await import('react')
      const app = render(createElement(MyApp, { db }))
      await app.waitUntilExit()
      break
    }
    default:
      console.log([
        'Usage: pollen <command>',
        '',
        'Commands:',
        '  stats       Summary dashboard',
        '  intents     Intent distribution',
        '  languages   Language breakdown',
        '  tools       Tool frequency + success rates (from actual usage)',
        '  flows       Tool sequences + failure patterns',
        '  mcp         MCP server usage ranking',
        '  projects    Project type distribution',
        '  topics      What people work on + try to do',
        '  satisfaction Session satisfaction scores + signals',
        '  sessions    Session summaries + workflow arcs',
        '  when        Time patterns',
        '  trends [n]  Daily trends (last n days, default 7)',
        '  my          Interactive dashboard — see exactly what you\'ve contributed',
        '  sync        Push local data to Neon (needs NEON_DATABASE_URL)',
        '  backfill-subjects  Extract subjects for existing sessions (needs ANTHROPIC_API_KEY)',
      ].join('\n'))
  }
} finally {
  db.close()
}
})()
