import { queryIntentRanking, queryToolRanking, queryCommandRanking, queryModelUsage } from '@/lib/queries'
import LiveDataTabs from './LiveDataTabs'

export default async function LiveDataPreview() {
  const [intents, tools, commands, models] = await Promise.all([
    queryIntentRanking('7d'),
    queryToolRanking('7d'),
    queryCommandRanking('7d'),
    queryModelUsage('7d'),
  ])

  const totalSessions = intents.reduce((sum, i) => sum + i.count, 0)

  return (
    <section style={{ padding: '0 80px 80px' }}>
      <LiveDataTabs
        data={{ topics: intents, tools, commands, models }}
        totalSessions={totalSessions}
      />
    </section>
  )
}
