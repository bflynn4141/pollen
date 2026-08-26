# Phase 4: Economics + Launch

> Historical phase plan. The 70/20/10 model below is not implemented. The
> current PollenTokenV2 contract distributes deposited USDC pro rata to all
> token holders and issues weekly POLLEN separately through receipt-backed
> scoring. The approved future V3 path uses weekly active-holder Merkle claims
> and is implemented but not live. See `ECONOMICS-DECISION.md` before changing
> or marketing economics.

> **Goal:** Contributors earn money. Product is public. Growth begins.
>
> **Duration:** 2 weeks
>
> **Gate:** 100 contributors, first organic paid query, first contributor payout
>
> **Depends on:** Phase 2 (World ID), Phase 3 (query revenue flowing)

## What We're Building

1. Payout engine — distribute query revenue to verified contributors
2. Open source the collector — MIT license, public repo
3. Distribution campaign — get to 100 contributors
4. Landing page — explain what Pollen is

## 1. Payout Engine

### Revenue Split

```
Query revenue received via x402
  │
  ├─ 70% → Contributor Pool
  ├─ 20% → Protocol Treasury (funds development + LLM costs)
  └─ 10% → Infrastructure Reserve (CF Workers, D1, RPC)
```

### Contributor Credit Model

```
Per valid contribution: 1 credit
Daily cap: 200 credits per contributor
Epoch: weekly (Monday 00:00 UTC to Sunday 23:59 UTC)

Payout calculation:
  your_payout = (your_credits / total_credits) × contributor_pool

Example:
  You contributed 120 credits this week
  Total network credits: 10,000
  Query revenue this week: $50
  Contributor pool: $50 × 0.70 = $35
  Your payout: (120 / 10,000) × $35 = $0.42
```

### Anti-Spam (v1 — basic, configurable later)

| Check | Rule |
|-------|------|
| Dedup | Identical feature vectors within 1 hour = counted once |
| Confidence | Classification confidence must be > 0.5 |
| Rate limit | Max 1 contribution per 30 seconds |
| Daily cap | 200 credits per contributor per day |
| Verification | Must be World ID verified to earn |

### Payout Mechanism

**Option A: Direct weekly distribution (simpler)**
```
Weekly cron:
  1. Calculate each contributor's share
  2. Batch USDC transfers on Base
  3. Contributors with < $1.00 carry over to next week
  4. Log all payouts in payout_history table
```

**Option B: Claimable balance (lower gas)**
```
Weekly cron:
  1. Calculate each contributor's share
  2. Update claimable_balance in contributors table
  3. Contributors claim via `pollen claim` when ready
  4. Claim triggers USDC transfer on Base
  5. No minimum — claim any amount
```

Start with Option B — lower gas costs (one tx per claim vs N txs per week), and contributors choose when to claim.

### Payout CLI

```bash
pollen earnings
# Output:
#   This week: 143 credits (of 200/day max)
#   Network total: 12,400 credits
#   Revenue this week: $62.00
#   Your estimated share: $0.50
#   Claimable balance: $2.15

pollen claim
# Triggers USDC transfer to linked wallet on Base
# Output:
#   Claimed $2.15 USDC → 0x8744...affd
#   Tx: 0xabc123...
```

### Schema Additions

```sql
CREATE TABLE payout_epochs (
  id              TEXT PRIMARY KEY,
  start_date      INTEGER,
  end_date        INTEGER,
  total_credits   INTEGER,
  total_revenue   REAL,
  contributor_pool REAL,
  status          TEXT DEFAULT 'open'  -- open | computing | finalized
);

CREATE TABLE payout_claims (
  id              TEXT PRIMARY KEY,
  contributor_id  TEXT,
  amount_usd      REAL,
  tx_hash         TEXT,
  claimed_at      INTEGER,
  epoch_id        TEXT
);

ALTER TABLE contributors ADD COLUMN claimable_balance REAL DEFAULT 0;
ALTER TABLE contributors ADD COLUMN total_earned REAL DEFAULT 0;
ALTER TABLE contributors ADD COLUMN total_credits INTEGER DEFAULT 0;
```

## 2. Open Source the Collector

**What's open source (MIT):**
- `pollen-cli` — the full npm package (hook, features, classifier, PII scrub, upload)
- Anyone can read exactly what data is collected and how
- This IS the trust layer until on-chain audit exists

**What stays proprietary (for now):**
- `packages/api` — the platform worker (aggregation, reports, payouts)
- Revenue model, query logic, narrative generation

**Repo setup:**
```bash
# Public repo
github.com/[org]/pollen-cli  (MIT license)

# Private repo (or same repo, separate packages)
github.com/[org]/pollen-platform
```

## 3. Distribution Campaign

### Wave 1: Inner Circle (Week 1)
- Personal outreach to 20-30 developer friends
- "Hey, I built this thing — install it and tell me if it's interesting"
- Goal: 30 contributors

### Wave 2: Crypto Twitter (Week 1-2)
- "Get paid for your prompts" narrative
- Thread: What Pollen is, why it matters, how to install
- Demo: show the weekly report with real (your own seeded) data
- Goal: 50 more contributors

### Wave 3: Early Adopter Incentive (Week 2)
- First 100 verified contributors get guaranteed $5/month for 3 months
  (regardless of query revenue — funded by protocol treasury)
- Eligibility: World ID verified + 50+ contributions in first week
  (prevents drive-by installs with no real usage)
- Goal: 100 total contributors

### Wave 4: Partnership Seeding (Ongoing)
- Reach out to Anthropic DevRel — "we have data about Claude Code usage"
- Reach out to AI tool builders — "want to know how developers prompt?"
- These become potential first buyers

## 4. Landing Page

Simple, single-page site. Not a marketing site — a product explanation.

```
pollen.dev (or similar)

Sections:
  1. Hero: "Your prompts pollinate shared intelligence"
  2. How it works: 3 steps (install → contribute → earn)
  3. What we collect: Transparent feature list + "we never see your prompts"
  4. Live stats: Contributor count, this week's top intents (from free pulse endpoint)
  5. For buyers: "Query prompt intelligence via API" + link to docs
  6. Trust: "Open source collector" + "World ID verified" + "no prompt text stored"
  7. Install: `npx pollen init`
```

Tech: Static site (Astro or plain HTML), deployed on Vercel or CF Pages.

## File Structure Additions

```
pollen/
├── packages/
│   ├── cli/
│   │   └── src/
│   │       ├── earnings.ts       # NEW: View earnings + credits
│   │       └── claim.ts          # NEW: Claim USDC payouts
│   │
│   ├── api/
│   │   └── src/
│   │       ├── payouts.ts        # NEW: Epoch computation + payout logic
│   │       └── claims.ts         # NEW: Claim processing + USDC transfer
│   │
│   └── site/                     # NEW: Landing page
│       ├── src/
│       │   └── index.html
│       └── package.json
│
└── docs/
```

## Success Criteria

- [ ] Payout epochs compute correctly (credits, revenue split, per-contributor share)
- [ ] `pollen earnings` shows accurate current + historical earnings
- [ ] `pollen claim` transfers USDC on Base to contributor wallet
- [ ] Open source repo published, README explains everything
- [ ] 100 verified contributors
- [ ] At least 1 organic paid query (not from us)
- [ ] Landing page live with real-time stats from pulse endpoint
- [ ] Early adopter incentive running ($5/month for first 100)
