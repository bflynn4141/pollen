export type Period = '7d' | '30d' | '90d'

export interface RankItem {
  name: string
  count: number
  trend: 'up' | 'down' | 'stable'
  changePercent: number | null
}
