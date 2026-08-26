# Pollen: Prompt Intelligence Network

> Historical design document. It does not describe the current production
> contract or launch position. Current Pollen exports only the closed network
> receipt documented in `packages/worker/src/ingest.ts`, never prompt text or
> raw session records. Public cells require k=5. Current x402 v2 revenue
> accrues pro rata to all POLLEN holders. The approved future V3 model instead
> uses weekly active-holder Merkle claims and is not live. See `LAUNCH-READINESS.md` and
> `ECONOMICS-DECISION.md`.

> Your prompts pollinate shared intelligence.

## What Is Pollen

An opt-in prompt intelligence network for Claude Code. Contributors install a lightweight npm package that captures their prompts, classifies them **locally**, and uploads only anonymized structured features + labels. Buyers query aggregated intelligence through a structured REST API (and eventually an MCP server) and pay via x402 micropayments. Contributors earn crypto for their data.

**The server never sees prompt text.** All sensitive processing happens on the contributor's machine.

## Core Architecture

```
CONTRIBUTOR'S MACHINE                    POLLEN PLATFORM                  BUYER
─────────────────────                    ───────────────                  ─────
Claude Code hook                         CF Worker + D1                   Any x402 client
  │                                        │                                │
  ▼                                        │                                ▼
Local PII scrub                            │                           REST API + x402
  │                                        │                                │
  ▼                                        │                                │
Local classifier (bundled)                 │                                │
  │                                        │                                │
  ▼                                        ▼                                │
Features + labels ───────────────────▶ Aggregate + store ◀──── x402 reports │
(no prompt text)                       (no prompt text)       (pre-computed)
  │                                        │
  ▼                                        ▼
World ID ZK proof ──────────────────▶ Verify (Semaphore)
(proves unique human)                  (on-chain audit later)
```

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Claude Code only | Ship fast, prove value, expand later |
| Classification | **Local** (bundled model) | Server never sees prompt text — eliminates #1 trust concern |
| Anonymization | Local PII scrub + feature coarsening | Bucketize, bin, generalize — prevent mosaic-effect fingerprinting |
| Data stored | Coarsened features + derived labels | Layered: features are stable, labels are re-derivable |
| Audit trail | Merkle root of **aggregates** on Base | Per-contribution records stay private; public aggregates only |
| Sybil resistance | World ID (Semaphore ZK) | 1 human = 1 contributor; ZK proves uniqueness without revealing identity |
| Buyer queries | Governed DSL with k-anon + DP | Not open-ended NL — prevents differencing/reconstruction attacks |
| Payments | x402 v2 micropayments | Current V2 rewards all holders; approved future V3 funds weekly active-holder Merkle claims |
| Payouts | Flat rate + daily cap | Simple, configurable, anti-spam by design |
| Positioning | Standalone product | Own brand, own repo, not a Clara/Vibe feature |

## Taxonomy (Layered Classification)

### Layer 1: Raw Features (stable, never re-derived)

| Feature | Type | Coarsening |
|---------|------|------------|
| keywords | string[] | Programming terms only, no proper nouns |
| tools_chain | string[] | Tool families (read, edit, execute, search) |
| language_signals | string[] | Broad categories (typescript, python, rust, etc.) |
| frameworks | string[] | Top-level only (react, next.js, fastapi, etc.) |
| prompt_length | enum | short (<25 words), medium (25-100), long (100+) |
| code_ratio | enum | none (0), low (<0.3), medium (0.3-0.7), high (>0.7) |
| structure_type | enum | imperative, question, error_paste, context_dump, conversation |
| session_depth | enum | first, early (2-5), mid (6-15), deep (16+) |
| has_error_trace | boolean | — |
| has_code_block | boolean | — |
| day_of_week | enum | mon-sun (no exact timestamp) |
| hour_bucket | enum | morning, afternoon, evening, night (6h buckets) |

### Layer 2: Derived Labels (re-derivable from features)

```
intent: debugging | feature_build | refactoring | learning | devops | testing | documentation | code_review | exploration
sub_intent: (varies by intent)
complexity: simple | moderate | complex
prompt_style: directive | conversational | context_heavy | minimal
session_type: exploration | focused_task | debugging_session | learning_session
domain: web_frontend | web_backend | mobile | data | devops | systems | general
taxonomy_version: "v1.0"
confidence: 0.0-1.0
```

## Revenue Model

```
Query pricing: $0.03 - $0.10 per query (tiered by complexity)
Revenue split: 70% contributors / 20% protocol / 10% infrastructure

Contributor payouts:
  - 1 credit per valid contribution
  - Daily cap: 200 credits per contributor
  - Weekly epochs
  - Historical proposal only. The approved V3 formula is documented in `ECONOMICS-DECISION.md`.
  - Minimum payout: $1.00 USDC on Base
  - Anti-spam: dedup, confidence > 0.5, rate limit 1/30s
```

## Phases

- [Phase 0: Validate](./PHASE-0.md) — Hook + local classifier + SQLite (Week 1)
- [Phase 1: Collector + API](./PHASE-1.md) — npm package + CF Worker (Weeks 2-3)
- [Phase 2: World ID](./PHASE-2.md) — Sybil resistance (3-5 days)
- [Phase 3: Query API](./PHASE-3.md) — Pre-computed reports + x402 REST API (Weeks 4-5)
- [Phase 4: Economics + Launch](./PHASE-4.md) — Payouts + distribution + open source (Weeks 6-7)

### Future Phases (when scale demands)
- **Phase 5: MCP Query Layer** — When 500+ contributors, ship `@pollen/mcp` for open exploration
- **Phase 6: On-Chain Audit** — Merkle roots + Dune dashboard when enterprise buyers ask for it
- **Phase 7: ZK Contribution Proofs** — Prove features came from real prompts (zkML matures)

## Security Posture (Post-Audit)

Reviewed by GPT-5.2 security audit. Key mitigations:

1. **No prompt text leaves the machine** — local classification eliminates server trust
2. **Coarsened features** — bucketized/binned to prevent mosaic-effect fingerprinting
3. **Governed queries** — k-anonymity + differential privacy + per-buyer privacy budgets
4. **Private contribution logs** — public Merkle roots commit to aggregates, not individuals
5. **World ID ZK** — Semaphore proves uniqueness without linking identity
6. **Supply chain hardening** — minimal deps, signed releases, no install scripts
7. **Deletion-compatible audit** — aggregate commitments remain valid after individual deletion
