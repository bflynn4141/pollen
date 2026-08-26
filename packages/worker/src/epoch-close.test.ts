import { beforeEach, describe, expect, it, vi } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
}))

vi.mock('@pollen/data', () => ({
  getDb: () => mocks.sql,
}))

import {
  getEpochHealth,
  MIN_PAYOUT_ELIGIBLE_CONTRIBUTORS,
  receiptPointsV2,
  runEpochClose,
  SCORING_V2,
} from './epoch-close'

type QueryState = {
  receiptContributor?: boolean
  legacyContributor?: boolean
}

interface CapturedQuery {
  text: string
  numberedText: string
  values: unknown[]
}

const healthAccount = privateKeyToAccount(`0x${'33'.repeat(32)}`)

async function payoutCandidates(count: number, invalidLast = false) {
  return Promise.all(Array.from({ length: count }, async (_, index) => {
    const contributorId = `eligible-${index + 1}`
    return {
      contributor_id: contributorId,
      wallet_address: healthAccount.address,
      wallet_binding_sig: invalidLast && index === count - 1
        ? '0xdeadbeef'
        : await healthAccount.signMessage({ message: `pollen:register:${contributorId}` }),
    }
  }))
}

function installEpochDatabase(state: QueryState): CapturedQuery[] {
  const queries: CapturedQuery[] = []
  mocks.sql.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join('?')
    const numberedText = strings.reduce(
      (result, chunk, index) => result + chunk + (index < values.length ? `$${index + 1}` : ''),
      '',
    )
    queries.push({ text: query, numberedText, values })

    if (/SELECT COUNT\(\*\)::int AS n FROM epoch_scores/.test(query)) {
      return [{ n: 0 }]
    }
    if (/INSERT INTO epoch_scores/.test(query)) {
      if (/FROM network_receipts/.test(query)) {
        return state.receiptContributor ? [{ contributor_id: 'receipt-only' }] : []
      }
      if (/FROM (?:sessions|tool_events)/.test(query)) {
        return state.legacyContributor ? [{ contributor_id: 'legacy-only' }] : []
      }
    }
    return []
  })
  return queries
}

describe('epoch-close production data source', () => {
  beforeEach(() => {
    mocks.sql.mockReset()
  })

  it('scores a registered contributor who has authenticated receipts only', async () => {
    const queries = installEpochDatabase({ receiptContributor: true })

    const result = await runEpochClose({ epoch: 1 })

    expect(result.status).toBe(200)
    expect(result.body.scored).toBe(1)
    const scoringQuery = queries.find(query => query.text.includes('INSERT INTO epoch_scores'))?.text ?? ''
    expect(scoringQuery).toContain('FROM network_receipts')
  })

  it('does not score a contributor represented only by legacy raw rows', async () => {
    const queries = installEpochDatabase({ legacyContributor: true })

    const result = await runEpochClose({ epoch: 1 })

    expect(result.status).toBe(200)
    expect(result.body.scored).toBe(0)
    const scoringQuery = queries.find(query => query.text.includes('INSERT INTO epoch_scores'))?.text ?? ''
    expect(scoringQuery).not.toMatch(/\b(?:sessions|tool_events)\b/)
  })

  it('keeps deterministic per-day and per-epoch anti-farm caps in the SQL path', async () => {
    const queries = installEpochDatabase({ receiptContributor: true })

    await runEpochClose({ epoch: 1 })

    const scoring = queries.find(query => query.text.includes('INSERT INTO epoch_scores'))
    expect(scoring?.text).toContain('PARTITION BY contributor_id, activity_day')
    expect(scoring?.text).toContain('ORDER BY receipt_points DESC, observed_at, receipt_id')
    expect(scoring?.values).toContain(SCORING_V2.receiptsPerDay)
    expect(scoring?.values).toContain(SCORING_V2.toolStepsPerReceipt)
    expect(scoring?.values).toContain(SCORING_V2.maxEpochScore)
  })

  it('casts jsonb cap parameters so PostgreSQL can infer every placeholder type', async () => {
    const queries = installEpochDatabase({ receiptContributor: true })

    await runEpochClose({ epoch: 1 })

    const scoring = queries.find(query => query.text.includes('INSERT INTO epoch_scores'))
    expect(scoring?.numberedText).toContain("'receipts_per_day', $22::int")
    expect(scoring?.numberedText).toContain("'tool_steps_per_receipt', $23::int")
    expect(scoring?.numberedText).toContain("'max_epoch_score', $24::numeric")
  })

  it('preserves the no-op guard for an already-scored epoch', async () => {
    mocks.sql.mockResolvedValueOnce([{ n: 1 }])

    const result = await runEpochClose({ epoch: 1 })

    expect(result.body.skipped).toBe(true)
    expect(mocks.sql).toHaveBeenCalledOnce()
  })
})

describe('scoring v2 formula', () => {
  it('is bounded even when a receipt contains the schema maximum tool sequence', () => {
    const points = receiptPointsV2({
      intent: 'feature_build',
      agent: 'codex',
      model: 'gpt-5.2-codex',
      tool_category_sequence: Array.from({ length: 64 }, () => 'execute'),
      duration_bucket: 'marathon',
      terminal_state: 'completed',
      check_result: 'passed',
    })

    expect(points).toBe(2.75)
    expect(points).toBe(SCORING_V2.maxReceiptPoints)
  })

  it('values a failed check as evidence that a check ran, not as worse data', () => {
    const base = {
      intent: 'debugging',
      agent: 'claude-code',
      model: 'claude-sonnet',
      tool_category_sequence: [],
      duration_bucket: 'quick',
      terminal_state: 'error_exit',
    }

    expect(receiptPointsV2({ ...base, check_result: 'failed' })).toBe(1.75)
    expect(receiptPointsV2({ ...base, check_result: 'passed' })).toBe(1.75)
    expect(receiptPointsV2({ ...base, check_result: 'not_run' })).toBe(1.25)
  })
})

describe('epoch health production data source', () => {
  beforeEach(() => {
    mocks.sql.mockReset()
  })

  it('reports authenticated receipt activity without consulting legacy raw tables', async () => {
    let healthQuery = ''
    mocks.sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join('?')
      if (query.includes('SELECT es.contributor_id')) return []
      healthQuery = query
      const receiptBacked = query.includes('FROM network_receipts')
      return [{
        contributors: 2,
        receipts: receiptBacked ? 3 : 0,
        active_registered_contributors: receiptBacked ? 1 : 0,
        epoch_scores: 1,
      }]
    })

    const health = await getEpochHealth(1)

    expect(health.source).toBe('network_receipts')
    expect(health.formula).toBe('v2-network-receipts')
    expect(health.receipts).toBe(3)
    expect(health.active_registered_contributors).toBe(1)
    expect(healthQuery).toContain('FROM network_receipts')
    expect(healthQuery).not.toMatch(/\b(?:sessions|tool_events)\b/)
  })

  it('reports payout quorum as unmet when one of five candidate bindings is invalid', async () => {
    const candidates = await payoutCandidates(5, true)
    let candidateQuery = ''
    mocks.sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join('?')
      if (query.includes('SELECT es.contributor_id')) {
        candidateQuery = query
        return candidates
      }
      return [{
        contributors: 5,
        receipts: 10,
        active_registered_contributors: 5,
        epoch_scores: 5,
      }]
    })

    const health = await getEpochHealth(1)

    expect(MIN_PAYOUT_ELIGIBLE_CONTRIBUTORS).toBe(5)
    expect(health.payout_eligible_contributors).toBe(4)
    expect(health.required_payout_eligible_contributors).toBe(5)
    expect(health.payout_ready).toBe(false)
    expect(candidateQuery).toContain('JOIN contributors')
    expect(candidateQuery).toContain('es.epoch')
  })

  it('reports payout-ready only when scores exist and five valid candidates qualify', async () => {
    const candidates = await payoutCandidates(5)
    mocks.sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join('?')
      if (query.includes('SELECT es.contributor_id')) return candidates
      return [{
        contributors: 5,
        receipts: 10,
        active_registered_contributors: 5,
        epoch_scores: 5,
      }]
    })

    const health = await getEpochHealth(1)

    expect(health.payout_eligible_contributors).toBe(5)
    expect(health.required_payout_eligible_contributors).toBe(5)
    expect(health.payout_ready).toBe(true)
  })
})
