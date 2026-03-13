# Bankr LLM Gateway Integration Plan

> Integrate Bankr's LLM Gateway into Pollen so the network can self-fund its
> own AI compute costs while giving contributors a token with real utility.

## Current State

| Component | Status |
|-----------|--------|
| POLLEN smart contracts (PollenToken.sol, PollenDistributor.sol) | Code exists, **not deployed** |
| Bankr LLM Gateway | **Live** — unified API for Claude, GPT, Gemini |
| $BNKR token on Base | **Deployed** — `0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b` |
| Pollen x402 query revenue | **Live** — buyers pay USDC per API query |
| Pollen scoring (IVS) | Runs locally, no LLM calls needed today |

## The Opportunity

Pollen currently has two places where LLM inference is (or will be) needed:

1. **Contribution scoring** — As the IVS model grows more sophisticated, it
   may need LLM calls for semantic quality scoring, deduplication, and trend
   extraction.
2. **Trend report generation** — Higher-tier API endpoints could use LLM
   summarization to produce natural-language trend reports for buyers.
3. **Future MCP query layer (Phase 5)** — Open-ended exploration queries will
   require LLM reasoning over aggregated data.

Bankr LLM Gateway lets agents pay for inference by holding funds in a Bankr
wallet. Revenue from x402 query fees can flow into that wallet, creating a
**self-sustaining compute loop**.

## Architecture

```
BUYERS                          POLLEN PLATFORM                    BANKR
─────                           ───────────────                    ─────
x402 query ──── USDC ────────▶  Revenue Pool
                                    │
                                    ├── 70% → POLLEN holders (contributor rewards)
                                    ├── 20% → Protocol treasury
                                    └── 10% → Infrastructure wallet
                                                │
                                                ▼
                                        Bankr Wallet (Base)
                                                │
                                                ▼
                                        Bankr LLM Gateway
                                         ┌─────────────┐
                                         │ Claude API   │
                                         │ GPT API      │
                                         │ Gemini API   │
                                         └─────────────┘
                                                │
                                                ▼
                                    IVS scoring / Trend reports
                                    returned to platform
```

## Integration Plan

### Phase A: Bankr Wallet + Gateway Setup (Week 1)

**Goal:** Platform holds a Bankr wallet that can pay for LLM inference.

1. **Create a Pollen platform Bankr wallet**
   - Use Bankr's headless email OTP flow to provision a wallet
   - Store the API key as `BANKR_API_KEY` in platform environment
   - The wallet auto-provisions Base + EVM addresses

2. **Configure LLM Gateway access**
   - Set up the LLM Gateway key via `bankr config set llmKey`
   - Target model: Claude (via `api: "anthropic-messages"` override)
   - Set rate limits appropriate for platform usage

3. **Fund the wallet**
   - Seed the Bankr wallet with initial USDC from protocol treasury
   - Configure the infrastructure revenue split (10%) to auto-route to
     the Bankr wallet address on Base

4. **Add gateway client to platform**
   - Create `packages/site/src/lib/bankr-gateway.ts`
   - Wrap Bankr LLM Gateway as an OpenAI-compatible client
   - Add cost tracking per-call for transparency

### Phase B: LLM-Powered Scoring (Weeks 2-3)

**Goal:** Use Bankr-funded LLM calls to enhance contribution quality scoring.

1. **Semantic quality scoring**
   - After local IVS scoring, optionally call Claude via Bankr Gateway
     for a second-pass semantic evaluation on borderline contributions
   - Score dimensions: novelty, specificity, actionability
   - Only invoke for contributions where local IVS confidence < 0.7

2. **Deduplication enhancement**
   - Use embeddings (via Gateway) for semantic dedup across contributors
   - Catches rephrased duplicates that keyword matching misses

3. **Cost controls**
   - Budget cap per epoch (e.g., $50/week from infrastructure split)
   - Fallback to local-only scoring if wallet balance drops below threshold
   - Track cost-per-contribution for ROI monitoring

### Phase C: LLM-Enhanced Trend Reports (Weeks 4-5)

**Goal:** Offer premium trend endpoints powered by LLM summarization.

1. **New premium endpoints**
   - `POST /api/trends/report` — LLM-generated natural language summary
   - `POST /api/trends/insights` — Cross-domain pattern analysis
   - Higher x402 pricing ($0.05-0.10) to cover LLM compute costs

2. **Report generation pipeline**
   - Aggregate raw trend data from existing endpoints
   - Pass to Claude via Bankr Gateway with structured prompt
   - Cache results for 1 hour to amortize costs
   - Revenue from these endpoints feeds back into the Bankr wallet

3. **Self-sustaining economics**
   - Premium endpoints generate more revenue than they cost in compute
   - Surplus flows back to infrastructure wallet → Bankr wallet → more compute
   - Target: 3x revenue-to-cost ratio on premium endpoints

### Phase D: POLLEN Token + BNKR Synergy (Weeks 6-8)

**Goal:** Create token utility that bridges POLLEN and the Bankr ecosystem.

Two options (not mutually exclusive):

#### Option 1: POLLEN Token with Bankr Gateway Utility

Deploy the existing POLLEN smart contracts with an added utility dimension:

- POLLEN holders can **stake POLLEN to unlock premium API tiers**
- Contributors who hold POLLEN get **boosted IVS multipliers**
- Protocol uses Bankr Gateway for all LLM compute (funded by revenue)
- POLLEN remains the contributor reward + revenue-share token
- BNKR integration: accept BNKR as an alternative payment method for
  x402 queries alongside USDC

#### Option 2: Use BNKR as the Native Token

Skip deploying a separate POLLEN token entirely:

- Contributors earn **BNKR directly** for contributions
- Revenue sharing flows through BNKR staking (Bankr already supports this)
- 90% of Bankr revenue goes to BNKR stakers — contributors benefit
- Lower overhead: no custom token deployment, no liquidity bootstrapping
- Leverage existing BNKR liquidity (~$2.7M) and market cap (~$47M)
- Bankr wallet already handles custody, staking, and yield

#### Option 3: Hybrid — POLLEN Token + BNKR Payments

- Deploy POLLEN for contributor rewards and governance
- Accept BNKR for query payments (alongside USDC)
- Use Bankr wallet for all operational treasury management
- BNKR holders get a discount on query prices (e.g., 20% off)
- Creates demand for BNKR from Pollen's buyer base

### Phase E: Self-Funding Compute Loop (Ongoing)

**Goal:** The network pays for its own AI infrastructure automatically.

```
Revenue In (x402 queries)
    │
    ▼
Revenue Pool (USDC on Base)
    │
    ├── 70% → Contributor rewards (POLLEN or BNKR)
    ├── 20% → Protocol development
    └── 10% → Bankr Wallet
                │
                ▼
          LLM Gateway Credits
                │
                ├── Contribution scoring (improves data quality)
                ├── Trend report generation (generates more revenue)
                └── Future: MCP query reasoning
                        │
                        ▼
                Higher quality → More buyers → More revenue → More compute
```

## Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | Create Bankr wallet + fund it | 1 day | Unblocks everything |
| P0 | Build `bankr-gateway.ts` client wrapper | 1 day | Core infra |
| P1 | Wire infrastructure revenue split to Bankr wallet | 2 days | Self-funding |
| P1 | LLM-enhanced IVS scoring | 3 days | Data quality |
| P2 | Premium trend report endpoints | 3 days | Revenue growth |
| P2 | Decide POLLEN vs BNKR vs hybrid token strategy | 1 week | Token economics |
| P3 | BNKR payment support in x402 layer | 3 days | Ecosystem synergy |
| P3 | Self-funding monitoring dashboard | 2 days | Operational visibility |

## Key Decisions Needed

1. **Token strategy**: Deploy POLLEN, use BNKR, or hybrid?
   - POLLEN gives full control but requires liquidity bootstrapping
   - BNKR gives instant liquidity + Bankr ecosystem but less control
   - Hybrid captures both but adds complexity

2. **Compute budget**: What % of revenue should fund LLM inference?
   - Current plan: 10% (infrastructure split)
   - Could increase to 15-20% if premium endpoints generate surplus

3. **Model selection**: Which LLM for scoring/reports?
   - Claude (best quality, higher cost) vs Haiku (good enough, cheaper)
   - Bankr Gateway supports automatic failover between providers

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Bankr Gateway downtime | Fallback to direct API keys, local-only scoring |
| LLM costs exceed revenue | Hard budget caps per epoch, local-only fallback |
| BNKR price volatility | Hold operating funds in USDC, convert to BNKR only for payments |
| Bankr platform risk | Keep direct API keys as backup, modular gateway abstraction |
| Smart contract risk | Audit before deployment, timelocks on admin functions |
