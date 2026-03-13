# POLLEN Token via Bankr + LLM Gateway Integration Plan

> Deploy $POLLEN via Bankr/Clanker on Base, use Bankr LLM Gateway for compute,
> and market to the Bankr user base.

## Strategy

**Deploy POLLEN as the native token using Bankr.** Bankr deploys tokens via
Clanker on Base — this gives us instant Uniswap V3 liquidity, swap fee revenue
to the creator wallet, and visibility across the Bankr/Farcaster ecosystem.
Bankr users are already crypto-native AI power users — the exact audience for
a prompt intelligence network.

## Current State

| Component | Status |
|-----------|--------|
| POLLEN smart contracts (custom Forge) | Code exists, **not deployed** |
| Bankr LLM Gateway | **Live** — unified API for Claude, GPT, Gemini |
| $BNKR token on Base | **Deployed** — `0x22aF33FE49fD1Fa80c7149773dDe5890D3c76F3b` |
| Pollen x402 query revenue | **Live** — buyers pay USDC per API query |
| Pollen CLI + hooks | **Live** — `npx @pollen/cli` |

## Architecture

```
BANKR ECOSYSTEM                    POLLEN NETWORK                     BUYERS
───────────────                    ──────────────                     ──────

@bankrbot deploys                  Pollen Platform                    x402 queries
$POLLEN on Base ──────────────▶   ┌──────────────┐                   │
(via Clanker)                      │              │◀──── USDC ────────┘
                                   │   Revenue    │
Bankr LLM Gateway ◀── credits ── │    Pool      │
     │                             │              │
     ▼                             └──────┬───────┘
Claude / GPT / Gemini                     │
     │                                    ├── 70% → POLLEN holders (contributor rewards)
     ▼                                    ├── 20% → Protocol treasury
Scoring + trend reports                   └── 10% → Bankr wallet → LLM Gateway credits
     │
     ▼
Better data quality → More buyers → More revenue → Loop
```

## Phase 1: Deploy $POLLEN via Bankr (Week 1)

### 1a. Token Launch via Bankr/Clanker

Bankr uses [Clanker](https://clanker.world) under the hood for token deployment.
Two paths:

**Option A — Social launch (recommended for visibility):**
- Tag `@bankrbot` on X or Farcaster with the token concept
- Bankr deploys $POLLEN as an ERC-20 on Base via Clanker
- Automatic Uniswap V3 liquidity pool creation
- Creator wallet receives 0.4% of all swap fees
- Instant tradability + discoverability on Bankr, DEXScreener, GeckoTerminal

**Option B — Programmatic launch via Clawncher SDK:**
```bash
npm install -g clawncher
# or
npm install @clawnch/clawncher-sdk
```
- Deploy with full control over name, symbol, supply, metadata
- Same Clanker contracts, same liquidity setup
- Better for precise parameter control

### 1b. Token Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Name | Pollen | Matches brand |
| Symbol | POLLEN | Clear, memorable |
| Chain | Base | Already the target chain for all Pollen infra |
| Supply | TBD (Clanker default or custom) | Clanker typically does 100B supply |
| Liquidity | Auto (Uniswap V3 via Clanker) | Immediate tradability |
| Creator fees | 0.4% of swaps → Pollen treasury | Passive revenue stream |

### 1c. Record Token Address

After deployment, capture the contract address and update:
- `POLLEN_TOKEN_ADDRESS` env var on Vercel + platform
- CLI config to point to the live token
- Site documentation with contract address + BaseScan link

### 1d. What Changes in the Codebase

The existing `PollenToken.sol` (custom Forge contract) had built-in revenue
sharing (`claimRevenue()`, `earned()`, `holdingSince()`). A Clanker-deployed
token is a standard ERC-20 — so we need to handle distribution differently:

**Keep as-is:**
- `PollenDistributor.sol` (Merkle-tree distribution) — deploy separately
  to distribute POLLEN tokens to contributors each epoch
- `claim.ts` — the Merkle claim flow still works, just points to the
  Clanker-deployed token address
- `previewClaim()` — `balanceOf` works on any ERC-20

**Modify:**
- `claim.ts` — remove `claimRevenue()` calls (revenue sharing moves off-chain
  or to a separate RevenueDistributor contract)
- `main.ts` — update the `claim` command messaging to reference Bankr deployment
- `config.ts` — add `BANKR_API_KEY` and `BANKR_LLM_KEY` to config

**New:**
- `packages/site/src/lib/bankr-gateway.ts` — Bankr LLM Gateway client
- Revenue distribution via epoch snapshots + Merkle proofs (USDC sent
  separately from token claims)

## Phase 2: Bankr LLM Gateway for Compute (Weeks 2-3)

### 2a. Set Up Platform Bankr Wallet

1. Create Bankr wallet via headless email OTP flow
2. Store `BANKR_API_KEY` in platform environment
3. Configure LLM Gateway key: `bankr config set llmKey`
4. Seed wallet with USDC from protocol treasury
5. Wire 10% infrastructure revenue split to auto-fund the wallet

### 2b. Build Gateway Client

Create `packages/site/src/lib/bankr-gateway.ts`:

```typescript
// Bankr LLM Gateway — OpenAI-compatible endpoint
// Agents pay for inference via Bankr wallet balance
const BANKR_GATEWAY_URL = 'https://api.bankr.bot/v1' // or equivalent

export async function callLLM(opts: {
  model: string          // 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-5-20250514'
  messages: Message[]
  maxTokens?: number
}) {
  const res = await fetch(`${BANKR_GATEWAY_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.BANKR_LLM_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 1024,
    }),
  })
  return res.json()
}
```

### 2c. Use Cases for LLM Compute

| Use Case | Model | Trigger | Est. Cost |
|----------|-------|---------|-----------|
| Semantic quality scoring | Haiku | IVS confidence < 0.7 | ~$0.001/call |
| Deduplication (embeddings) | Haiku | Every contribution | ~$0.0005/call |
| Trend report generation | Sonnet | Premium API endpoint | ~$0.01/report |
| MCP query reasoning (future) | Sonnet | Open-ended queries | ~$0.02/query |

### 2d. Cost Controls

- Hard budget cap per epoch: $50/week from infrastructure split
- Fallback to local-only scoring if balance < $10
- Per-call cost tracking logged to Neon for transparency
- Model routing: use Haiku by default, Sonnet only for premium endpoints

## Phase 3: Revenue Distribution Rework (Weeks 3-4)

Since Clanker tokens are standard ERC-20s (no built-in `claimRevenue()`),
revenue distribution needs a separate mechanism:

### Option A: Off-chain USDC distribution (simpler)

1. Platform tracks USDC revenue per epoch
2. At epoch close, compute pro-rata share per POLLEN holder
3. Distribute USDC via batch transfer from treasury wallet
4. Contributors claim via `pollen claim --revenue` which hits the proxy

### Option B: Deploy RevenueDistributor contract (trustless)

1. Deploy a simple Merkle-based USDC distributor (similar to PollenDistributor)
2. Each epoch: snapshot POLLEN balances, compute shares, publish Merkle root
3. Contributors claim on-chain with proof
4. Reuse existing `claim.ts` patterns

**Recommendation:** Start with Option A (off-chain), migrate to Option B once
volume justifies gas costs. The PollenDistributor.sol for token claims should
still be deployed on-chain via Forge for trustless contributor rewards.

## Phase 4: Marketing to Bankr Users (Weeks 4-6)

### Why Bankr Users Are the Perfect Audience

- **Already crypto-native** — have wallets, understand tokens
- **AI power users** — many use Claude, GPT, etc. daily
- **Agent-curious** — interested in autonomous AI + DeFi loops
- **On Base** — same chain, zero friction
- **Social-first** — active on Farcaster + X, viral distribution

### Marketing Strategy

1. **Launch announcement via @bankrbot on X/Farcaster**
   - Deploy $POLLEN live in a post — the deployment IS the announcement
   - "The first token that pays you for using Claude Code"
   - Bankr users can buy $POLLEN immediately

2. **Bankr skill integration**
   - Submit a Pollen skill to [BankrBot/openclaw-skills](https://github.com/BankrBot/openclaw-skills)
   - Lets Bankr agents query Pollen trend data natively
   - "Ask @bankrbot: What are developers building with Claude Code this week?"

3. **Cross-promotion with Bankr ecosystem**
   - Pollen as a featured data source in Bankr's agent marketplace
   - Joint content: "How AI agents are using prompt intelligence"
   - POLLEN listed on Bankr's swap interface

4. **Contributor onboarding via Bankr wallets**
   - Add Bankr as a third wallet option in `pollen wallet`:
     1. Managed wallet (Para) — existing
     2. Bring your own — existing
     3. **Bankr wallet** — new, one command, works with LLM Gateway too
   - Contributors who use Bankr wallets get the bonus of their wallet
     being LLM Gateway-ready

5. **Flywheel: Contributors → Token holders → Bankr users → Contributors**
   ```
   Claude Code user installs Pollen
        │
        ▼
   Earns POLLEN tokens for contributions
        │
        ▼
   Discovers Bankr ecosystem (swap, trade, DeFi)
        │
        ▼
   Tells other Claude Code users → More contributors
        │
        ▼
   More data → Better trends → More buyers → More revenue → Higher POLLEN value
   ```

## Phase 5: Self-Funding Compute Loop (Ongoing)

```
Revenue In (x402 queries + swap fees)
    │
    ▼
Revenue Pool (USDC on Base)
    │
    ├── 70% → POLLEN epoch distribution (Merkle claims)
    ├── 20% → Protocol development
    └── 10% → Bankr Wallet
                │
                ▼
          LLM Gateway Credits
                │
                ├── Contribution scoring (better data quality)
                ├── Trend reports (premium endpoints, more revenue)
                └── MCP query reasoning (future)
```

Plus: 0.4% creator swap fees from Clanker → additional treasury revenue.

## Implementation Checklist

| # | Task | Effort | Depends On |
|---|------|--------|------------|
| 1 | Deploy $POLLEN via Bankr/Clanker | 1 day | — |
| 2 | Record token address, update env vars + docs | 1 day | 1 |
| 3 | Deploy PollenDistributor.sol (Forge, for Merkle claims) | 1 day | 1 |
| 4 | Update `claim.ts` — remove custom revenue methods, point to Clanker token | 1 day | 2 |
| 5 | Create Bankr platform wallet + fund it | 1 day | — |
| 6 | Build `bankr-gateway.ts` client | 1 day | 5 |
| 7 | Wire 10% revenue split to Bankr wallet | 2 days | 5 |
| 8 | LLM-enhanced IVS scoring via Gateway | 3 days | 6 |
| 9 | Premium trend report endpoints | 3 days | 6 |
| 10 | Add Bankr wallet option to `pollen wallet` | 2 days | 5 |
| 11 | Submit Pollen skill to openclaw-skills repo | 1 day | 2 |
| 12 | Off-chain USDC revenue distribution | 3 days | 2 |
| 13 | Marketing launch (X/Farcaster deployment post) | 1 day | 1 |

## Codebase Changes Summary

### Modified Files

| File | Change |
|------|--------|
| `packages/cli/src/claim.ts` | Remove `claimRevenue()` / `TOKEN_ABI` revenue methods, keep Merkle distributor flow, point to Clanker token |
| `packages/cli/src/main.ts` | Update claim command messaging, remove Forge deployment instructions, add `bankr-wallet` command |
| `packages/cli/src/config.ts` | Add `bankr_wallet` to `PollenConfig`, add `BANKR_API_KEY` / `BANKR_LLM_KEY` env refs |
| `packages/cli/src/earnings.ts` | Update to read from Clanker token address |
| `packages/site/.env` | Add `BANKR_API_KEY`, `BANKR_LLM_KEY`, `POLLEN_TOKEN_ADDRESS` |

### New Files

| File | Purpose |
|------|---------|
| `packages/site/src/lib/bankr-gateway.ts` | Bankr LLM Gateway client wrapper |
| `packages/site/src/app/api/trends/report/route.ts` | Premium LLM-powered trend reports |
| `packages/site/src/app/api/trends/insights/route.ts` | Premium LLM-powered cross-domain insights |

### Removed/Deprecated

| Item | Reason |
|------|--------|
| `contracts/src/PollenToken.sol` | Replaced by Clanker-deployed ERC-20 |
| `contracts/script/Deploy.s.sol` (token portion) | Token deployed via Bankr, not Forge |
| Revenue sharing in `PollenToken.sol` | Moves to off-chain distribution or separate contract |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Clanker token is standard ERC-20 (no custom features) | Deploy PollenDistributor separately for Merkle claims; handle revenue off-chain |
| Bankr Gateway downtime | Fallback to direct Anthropic API keys |
| LLM costs exceed revenue | Hard budget caps, Haiku by default, local-only fallback |
| Token gets confused with unrelated POLLEN tokens | Clear branding, official contract address in docs + CLI |
| Bankr platform dependency | Modular gateway abstraction, direct API backup |
| Swap fee revenue volatility | Don't depend on it — treat as bonus treasury income |
