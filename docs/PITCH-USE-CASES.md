# Pollen: Pitch Narrative & Use Cases

*The intelligence layer for the developer tool ecosystem.*

---

## The Problem

Every developer tool company is flying blind.

The $50B+ developer tools market has no behavioral data layer. Framework teams, cloud platforms, MCP server builders, and DevRel organizations make product decisions based on:

| Signal Available Today | What It Actually Tells You | What It Misses |
|------------------------|---------------------------|----------------|
| GitHub stars | Marketing reach | Whether anyone actually *uses* it |
| npm / PyPI downloads | CI pipeline installs | Whether it's in `devDependencies` gathering dust |
| Stack Overflow survey | Annual self-reported preferences | Real behavior, recency, workflow context |
| GitHub Copilot telemetry | What one vendor's users do | Cross-tool behavior, intent, satisfaction |
| Twitter / HN sentiment | What loud people say | What quiet people do |

**The gap:** Nobody knows what developers are *actually doing* — which tools they reach for, which ones they abandon, what makes them productive vs. frustrated. The 90% of development work that happens before a `git push` is invisible.

---

## The Solution

**Pollen is an opt-in prompt intelligence network for Claude Code.**

Contributors install a lightweight hook that captures session behavior, classifies it *locally on their machine*, and uploads coarsened features to a shared intelligence layer. Buyers query the aggregate via x402 micropayments.

**What makes it different:**

1. **Behavioral, not declarative.** We capture what developers *do*, not what they *say* they do.
2. **Real-time, not annual.** Data flows continuously, not once a year in a survey.
3. **Privacy-first by architecture.** The server never sees prompt text. All classification happens locally. Identity is verified via World ID ZK proofs — sybil-resistant without being invasive.
4. **Contributor-owned.** Users earn 70% of query revenue. Their data, their upside.

---

## What Pollen Captures (The Data Shape)

Every coding session generates structured behavioral signals:

### Session-Level Intelligence
- **Intent sequence:** What the developer was trying to do, and how it evolved (debugging → feature_build → testing)
- **Duration and depth:** Quick fixes vs. marathon sessions; first prompt vs. deep exploration
- **Outcome:** Completed, abandoned, or crashed — and the satisfaction signals that predict each
- **Tools used:** Which MCP servers, which Claude tools, in what order
- **Domain:** web_frontend, web_backend, devops, data, systems, web3

### Per-Prompt Intelligence
- **Intent:** debugging, feature_build, refactoring, learning, devops, testing, documentation, code_review, exploration
- **Action + Topic:** "fix auth", "create api", "deploy infra", "test database"
- **Complexity:** simple, moderate, complex
- **Languages & Frameworks:** Actual usage, not just presence in a repo
- **Error patterns:** What breaks, how often, which categories

### What the Server NEVER Sees
- Prompt text (not even anonymized)
- File paths or project names
- Code content
- Exact timestamps (only day-of-week + 6-hour buckets)
- Real identity (only World ID nullifier hash)

---

## The Products

### Product 1: Framework & Tool Adoption Tracker

**The "Sensor Tower for developer tools."**

**Buyers:** Framework teams (Next.js, Astro, Remix, SvelteKit), cloud platforms (Cloudflare, Vercel, AWS), devtool companies (Prisma, Drizzle, Supabase, PlanetScale)

**Example queries:**
- "React vs. Vue vs. Svelte: weekly session share trend over 90 days"
- "What % of TypeScript sessions also use Prisma? How has that changed?"
- "Svelte adoption: is it coming from React switchers or new developers?"
- "Prisma complexity distribution — are new users (simple) growing faster than power users (complex)?"

**Why they'd pay:** DevRel teams at framework companies currently rely on npm download counts and Twitter vibes. A behavioral dataset showing *actual daily session usage* is the difference between guessing and knowing. DevRel budgets at top-tier companies are $2-5M/year — x402 queries at $0.03-0.08 are negligible.

**Query pricing:**
- Basic trend (single dimension): $0.03
- Comparison (two frameworks, overlaid): $0.05
- Breakdown (multi-dimensional, e.g., framework × domain × complexity): $0.08

---

### Product 2: MCP Ecosystem Intelligence

**"App Annie for the MCP ecosystem."**

**Buyers:** MCP server builders, Anthropic ecosystem team, AI agent companies, developer platforms

**Example queries:**
- "Top 10 most-used MCP servers this week, by session count"
- "MCP server retention: what % of users who try server X use it again within 7 days?"
- "MCP server pairing graph: which servers are commonly used together?"
- "Which MCP servers dominate in `domain: web3` sessions?"

**Why this is uniquely Pollen's:** The MCP ecosystem has *zero* analytics today. Server builders ship into a void — no install counts, no usage metrics, no retention data. Pollen sits at the Claude Code layer where all MCP calls flow through, making it the *only* source of cross-server usage data.

**Why it matters strategically:** As the MCP ecosystem grows (driven by Anthropic, tooling companies, and the broader agentic AI movement), demand for ecosystem analytics grows with it. First-mover advantage in MCP analytics is a durable competitive position.

---

### Product 3: Breaking Change Radar

**"Sentry for the ecosystem."**

**Buyers:** Package maintainers, DevRel teams, CI/CD platforms (GitHub, GitLab), developer security companies

**Example queries:**
- "Alert: debugging sessions involving `prisma` + `typescript` spiked 380% in the last 48 hours"
- "Error category breakdown for `framework: react` — what's failing and how?"
- "Which tool chains correlate with successful resolution of `topic: auth` debugging sessions?"
- "Week-over-week change in `outcome: abandoned` for sessions touching `framework: next`"

**Why they'd pay:** When a framework ships a breaking change, maintainers currently find out when GitHub issues spike 2-3 days later. Behavioral anomaly detection catches it within hours. That's the difference between a controlled response and a PR crisis.

---

### Product 4: Developer Productivity Benchmarking

**"Jellyfish, but behavioral."**

**Buyers:** Engineering leaders, CTOs, VP Engineering at companies with 50+ developers using Claude Code

**Example queries:**
- "What's the industry median debugging-to-building ratio? How do we compare?"
- "Average satisfaction score by domain (frontend vs. backend vs. devops)"
- "Tool failure rate benchmarks — are we above or below average?"
- "What session patterns correlate with high satisfaction and completed outcomes?"

**Why this beats existing tools:** The $2B engineering productivity market (Jellyfish, LinearB, Pluralsight Flow) relies on Git commit data — a lagging indicator. Pollen captures the work *before* the commit: the thinking, debugging, exploring, and iterating that Git never sees. This is a fundamentally richer signal.

---

## Revenue Model: x402 Micropayments

Pollen is a **permissionless data marketplace** powered by x402 micropayments on Base.

### Why x402 (Not SaaS Subscriptions)

| Advantage | Detail |
|-----------|--------|
| **No sales cycle** | Any machine can query and pay instantly — no demos, contracts, or invoicing |
| **Permissionless** | New buyers can start querying with zero onboarding |
| **Machine-native** | Built for a world where AI agents have wallets and budgets |
| **Contributor alignment** | Revenue flows directly to contributors (70/30 split) |
| **Scales with demand** | No pricing tiers to negotiate — pay for what you use |

### Query Pricing

| Query Type | Price | Example |
|-----------|-------|---------|
| Daily pulse (free tier) | $0.00 | "High-level summary: top intents, trending frameworks" |
| Single-dimension trend | $0.03 | "React session share, last 30 days" |
| Comparison | $0.05 | "React vs. Svelte, weekly session share" |
| Multi-dimensional breakdown | $0.08 | "Framework × domain × complexity matrix" |
| Weekly report (narrative) | $0.05 | "AI-generated narrative of the week's trends" |
| Custom aggregation | $0.10 | "Sessions with `topic: auth` AND `intent: debugging`, grouped by framework" |

### Revenue Split

```
70% → Contributors (distributed weekly by credit share)
20% → Protocol Treasury (development, LLM costs for narratives)
10% → Infrastructure (Cloudflare Workers, D1, RPC)
```

### Revenue Projections at Scale

The x402 model requires **programmatic buyers** (machines querying automatically) to reach meaningful revenue. Human dashboard usage alone caps at ~500 queries/day.

**Volume drivers:**

| Buyer Category | Mechanism | Volume Estimate |
|---------------|-----------|-----------------|
| MCP servers querying for context | Each MCP server makes 10-50 queries/day to improve its suggestions | 1,000 servers × 20 queries = 20,000/day |
| DevTool integrations | IDE extensions, package managers, CI tools embed Pollen queries | 500 tools × 50 queries = 25,000/day |
| AI agents (autonomous) | Agents with budgets querying for research, analysis, evaluation | 10,000 agents × 5 queries = 50,000/day |
| Human dashboard users | Framework teams, DevRel, engineering leaders | ~500/day |

**Annual revenue by scenario:**

```
Conservative (10K queries/day × $0.05):   $182K/year
Moderate (50K queries/day × $0.05):       $912K/year
Aggressive (100K queries/day × $0.05):    $1.8M/year

+ Training signal licensing (1-2 deals):  $200K-500K/year
```

---

## Demand Seeding Strategy

The cold-start problem for a two-sided marketplace: without buyers, contributors earn nothing and churn. Without contributors, buyers have no data to query.

### Prong 1: Build Showcase MCP Servers

Build 2-3 MCP servers that query Pollen natively, demonstrating the model and generating baseline query volume.

**Showcase MCP Server Ideas:**

1. **`pollen-insights` MCP Server**
   An MCP server any developer can install that gives them AI-powered coding intelligence: "Based on 50K sessions with this framework, here's the most effective debugging approach." This both generates query volume AND recruits contributors (you must contribute to use it).

2. **`pollen-bench` MCP Server**
   A benchmarking tool that compares your session patterns against the aggregate: "Your debugging-to-building ratio is 40% vs. the median of 28%. Here are the tool chains power users favor." Generates queries on every session comparison.

3. **`pollen-radar` MCP Server**
   Real-time ecosystem health monitoring: "Debugging spikes detected for prisma@5.22 — known issue? Check Pollen." Generates continuous background queries for anomaly detection.

### Prong 2: Partner with Existing MCP Builders

Integrate Pollen queries into popular existing MCP servers to create programmatic demand.

**Partnership pitch to MCP builders:**
> "Add one API call to your MCP server. Query Pollen for context about what your users are doing — what tool chains work best, what errors are common, what patterns lead to success. Your server gets smarter. You pay per query via x402. Your users get better outcomes."

**Target partners:**
- Popular developer tool MCP servers (code review, deployment, testing)
- AI agent frameworks that could query Pollen for development context
- IDE extension developers who want behavioral benchmarking

**What we offer partners:**
- Free query credits during beta (subsidized by protocol treasury)
- Co-marketing: "Powered by Pollen intelligence"
- Early access to new query types

---

## The Moat

| Moat | Why It's Defensible |
|------|-------------------|
| **Network effects** | More contributors → richer data → better products → more buyers → more revenue → more contributors. Classic data flywheel. |
| **Privacy architecture** | Server never sees prompt text. World ID + ZK proofs. Competitors who collect raw prompts face regulatory and trust headwinds. |
| **First mover in MCP analytics** | MCP ecosystem is early. Being the analytics layer now means being the default later. No competition exists today. |
| **Data compounds over time** | Historical behavioral data is irreplaceable. A competitor starting in 2027 can never reconstruct 2026's trends. |
| **Two-sided marketplace lock-in** | Contributors earn income → switching cost. Buyers build on query API → integration cost. Both sides are sticky. |
| **x402 native** | Built for machine-to-machine commerce. Competitors using API keys + Stripe are building for 2020's internet, not 2027's agentic web. |

---

## Competitive Landscape

| Player | What They Have | What They Lack |
|--------|---------------|---------------|
| **StackOverflow Survey** | Brand, reach, 100K+ responses | Annual, self-reported, no behavioral signal |
| **npm / PyPI stats** | Download counts at scale | Zero usage signal — downloads ≠ usage |
| **BuiltWith** | Website technology detection | Only sees deployed tech, not development workflow |
| **Datadog / New Relic** | Production telemetry | Nothing about the development *process* |
| **GitHub Copilot** | AI coding telemetry (massive scale) | Closed, single-vendor, will never share |
| **JetBrains Survey** | IDE usage data | Annual survey, IDE-specific, no AI workflow data |
| **Pollen** | Real-time behavioral data, cross-tool, privacy-first, contributor-owned, x402 native | Needs scale (that's why we're raising) |

**Key differentiator:** Every competitor either has (a) stale data (annual surveys), (b) vanity metrics (downloads, stars), or (c) closed data (Copilot). Pollen is the only source of real-time, behavioral, cross-tool developer intelligence — and it's contributor-owned.

---

## The Training Signal Kicker

As the dataset grows, the most valuable long-term application may not be analytics at all — it's improving AI models themselves.

LLM companies need to understand:
- Where does AI-assisted coding fail? (high `tool_failure_count`, low satisfaction)
- Which intents are hardest to satisfy? (persistent debugging, abandoned sessions)
- How do developer workflows evolve over time?

Pollen can provide this signal **without ever exposing a single prompt**. Coarsened behavioral features + intent classifications tell model developers where to focus improvement efforts.

This is a licensing opportunity ($200K-$500K per annual contract) with 2-3 potential buyers (Anthropic, OpenAI, Google DeepMind). The dataset gets more valuable with every contributor — and unlike the query marketplace, licensing deals have near-zero marginal cost.

---

## Traction & Status

### Built (Phase 0 — Complete)
- Local hook capturing 5 event types from Claude Code
- Feature extraction: keywords, tools, languages, frameworks, structure, session depth
- Heuristic classifier: 9 intents, complexity, style, domain
- Action + topic extraction (23 actions, 22 topics)
- Session tracking with LLM-extracted subjects
- Satisfaction scoring (behavioral proxy for developer happiness)
- SQLite local storage with CLI queries
- Trends visualization dashboard (Next.js + Recharts)

### In Progress (Phase 1)
- Contributor registration
- PII scrubbing pipeline
- Batch upload to API
- Signature verification

### Designed, Not Started (Phase 2-4)
- World ID integration (sybil resistance)
- Pre-computed reports with differential privacy
- x402 query marketplace
- Payout engine and economics
- Open source release

### Early Contributors
- [X] contributors in early access
- Local data validates the signal quality
- [Note any qualitative feedback or notable insights from early data]

---

## The Ask

Raising [$ amount] to:

1. **Scale from 100 → 100K contributors** (distribution, DevRel, partnerships)
2. **Launch the x402 query marketplace** (Phase 3)
3. **Build showcase MCP servers** (demand seeding)
4. **Integrate with 5-10 existing MCP servers** (partnership program)
5. **Close first training signal licensing deal**

---

## One-Liner

> **Pollen is the intelligence layer for the developer tool ecosystem — a privacy-first data network where 100K+ developers contribute behavioral signals, and machines query it via x402 micropayments to build smarter tools.**
