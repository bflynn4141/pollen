import { describe, expect, it } from 'vitest'
import { renderEarnings, type EarningsData } from './earnings'

describe('receipt-backed earnings breakdown', () => {
  it('renders scoring v2 receipt components without legacy session metrics', () => {
    const data: EarningsData = {
      contributorId: 'contributor-test',
      walletAddress: '0x1111111111111111111111111111111111111111',
      paraWallet: null,
      worldIdVerified: true,
      currentEpoch: 25,
      scores: [{
        epoch: 24,
        score: 34.25,
        breakdown: {
          formula: 'v2-network-receipts',
          active_days: 2,
          receipts_scored: 6,
          receipt_points: 14.25,
          tool_steps_capped: 31,
          completed_receipts: 5,
          checked_receipts: 4,
          distinct_intents: 3,
          distinct_agents: 2,
          distinct_models: 2,
        },
      }],
      payouts: [],
    }

    const output = renderEarnings(data)

    expect(output).toContain('Receipts (capped): 6')
    expect(output).toContain('Receipt points: 14.25')
    expect(output).toContain('Checks run: 4')
    expect(output).not.toContain('Sessions (weighted)')
  })
})
