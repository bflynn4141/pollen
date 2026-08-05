# Pollen Phase 5: The Hive — Contributor Engagement Layer

> The contributor-side product surface. Why humans install pollen, and why they keep it running.

**Status:** Working draft. TBDs flagged inline. This is a thinking document, not a commitment.

**Relationship to existing strategy:** This is an **extension**, not a pivot. Phases 0–4 remain intact. Phase 5 adds a contributor-facing product surface on top of the same architecture. The B2B data marketplace remains the revenue engine.

---

## 1. Why This Phase Exists

### The Gap in the Current Plan

The existing docs (`PLAN.md`, `PITCH-USE-CASES.md`, `IMPLEMENTATION-PLAN.md`, `PHASE-0..4.md`) are strong on:

- Data collection architecture (local classification, coarsened features, privacy).
- Buyer-side products (adoption tracker, MCP intelligence, breaking-change radar, benchmarking).
- Revenue model (x402, 70/30 split, epoch payouts).
- Trust and privacy (World ID ZK, differential privacy, Merkle roots).

They are **weak** on one thing: **why does a human install pollen and keep it running?**

Today's implicit answer is "altruism + crypto earnings." Historical precedent: this is not enough to acquire or retain developers at scale. Crypto payouts alone attract low-quality contributors (sybils, farmers) and don't retain high-quality ones (who don't need the money). Altruism scales to early adopters and stops.

### The Hypothesis

Contributors will install pollen if it offers:

1. **Personal insight they can't get elsewhere** — behavioral feedback about their own craft.
2. **Positioning in a peer cohort** — how they compare on dimensions that *actually* matter in the AI-augmented era.
3. **A mission** — their contribution makes the ecosystem-wide signal more valuable (already the B2B story).
4. **Economic upside** — earn via revenue share (already designed in Phase 4).

The Hive is layers 1 and 2. The B2B marketplace is layers 3 and 4.

---

## 2. The Thesis: Idea and Judgment

### Why Classic Skill Axes Don't Work Anymore

Traditional engineering ranking axes — debug velocity, test-first rate, commit frequency, refactoring volume — made sense when the bottleneck was mechanical output. Modern AI tooling has collapsed that bottleneck.

In 2026, the human's differential contribution is no longer **speed at executing a known task**. It's:

- **Idea** — choosing *what* to build and *where* to explore, including novelty and recombination.
- **Judgment** — deciding *when* to trust AI output, *when* to intervene, *when* to abandon, and *how* to verify.

These are the dimensions that differentiate contributors whose work ships and survives from contributors whose sessions generate code that gets reverted.

### Why This Is Also a B2B Signal

Framework and tool teams do not just want adoption counts. They want to know:

- Which populations of developers are doing the *best work* on their stack?
- Where is the frontier moving — which niche topics are about to trend?
- What distinguishes high-judgment users from low-judgment users on our platform?

Quality-weighted aggregates — signal filtered by contributor judgment score — command higher prices than raw adoption counts. This is the product kicker Phase 5 unlocks.

---

## 3. The Axes

### Judgment Axes (7 candidates)

| # | Axis | Definition | Signal Source |
|---|------|------------|---------------|
| J1 | **Convergence speed** | Time from first prompt to satisfaction signal, normalized by session complexity | Hook: session timing, satisfaction, complexity proxies |
| J2 | **Abandonment intelligence** | Ratio of (early-abandon → next-approach-succeeds) vs (late-abandon after thrashing) | Hook: lifecycle_events, session outcomes |
| J3 | **Tool-choice decisiveness** | First tool succeeds vs switching chains; measured per intent category | Hook: tool_events, tool success/fail |
| J4 | **Verification discipline** | Read-after-Edit rate, test-run-after-change rate, type-check rate | Hook: tool_events ordering |
| J5 | **Permission discipline** | Ratio of scoped grants vs `bypassPermissions` by session risk level | Hook: permission mode, tool categories |
| J6 | **Work retention** | Commits that stay merged 7 days vs reverted, after sessions that produced them | **New**: git-aftermath instrumentation needed |
| J7 | **Override quality** | When contributor corrects AI output, does it lead to session success? | Hook: rejected tool calls + outcome correlation |

### Idea Axes (5 candidates)

| # | Axis | Definition | Signal Source |
|---|------|------------|---------------|
| I1 | **Topic novelty** | Rarity of your topic distribution vs cohort baseline | `coarsen.ts` topics + cohort aggregates |
| I2 | **Concept recombination** | Unusual co-occurrence of topics in single sessions (topic-pair rarity) | `coarsen.ts` + session-level topic vectors |
| I3 | **First-mover signal** | You touched a topic N days before it entered cohort trend | Historical cohort aggregates with timestamps |
| I4 | **Problem difficulty** | Session depth × tool-chain complexity × completion status | Hook: depth, tool_events, satisfaction |
| I5 | **Originality fingerprint** | Distance from cluster centroid in session-pattern embedding space | **New**: embedding + clustering pipeline |

### Axis Design Principles

1. **Multiple axes, no single score.** Developers will reject a "Judgment = 7.3/10" composite. They will accept "your convergence speed is 85th percentile, your verification discipline is 45th percentile" — facts, not verdicts.
2. **Percentile-based, not absolute.** Ranking against the cohort, always. Protects against inflation, makes cold-start manageable (TBD: synthetic baselines).
3. **Descriptive framing.** "Your fingerprint" not "your score." Anthropological, not evaluative.
4. **Publish the methodology.** Every axis has a spec page. Developers who want to argue with it can. Trust is earned by defensibility.
5. **Opt-in per axis visibility.** Contributors choose which axes appear on their public profile.

---

## 4. Derivability Audit

Against the current hook pipeline (`packages/cli/src/hooks/*`):

**Fully derivable today (no new instrumentation):**
- J1 Convergence speed
- J2 Abandonment intelligence
- J3 Tool-choice decisiveness
- J4 Verification discipline
- I1 Topic novelty (once cohort baselines exist on the backend)
- I2 Concept recombination (topic vectors are small, computable)
- I4 Problem difficulty (with noise)

**Partially derivable (some new capture needed):**
- J5 Permission discipline — partially captured; need permission-mode signal in lifecycle_events
- J7 Override quality — rejected tool calls captured; need to correlate with outcome

**Needs new instrumentation:**
- J6 Work retention — requires a git-aftermath poller that checks commit survival 7 days post-session. Can be a separate daemon, not part of the hot-path hook.
- I3 First-mover signal — needs backend-side cohort trend tracking with timestamped topic aggregates. Infrastructure, not hook change.
- I5 Originality fingerprint — needs embedding + clustering pipeline on the backend. Heavier lift.

**MVP axis set (ship-first):** J1, J2, J3, J4, I1, I4. All derivable. Six axes is enough for a meaningful profile without overwhelming UX.

---

## 5. Contributor Profile Surface

### What a Profile Page Shows

A public (opt-in) URL like `pollen.xyz/@brian`:

```
┌─ Brian's Pollen Fingerprint ─────────────────────────────┐
│                                                           │
│  Sessions tracked: 1,247    Epochs contributed: 14        │
│  Earnings (lifetime): 42.18 USDC                          │
│                                                           │
│  ── Judgment Fingerprint ─────────────────────           │
│  Convergence speed        █████████░  87%ile             │
│  Abandonment intelligence ██████░░░░  62%ile             │
│  Tool-choice decisiveness █████████░  82%ile             │
│  Verification discipline  ████░░░░░░  41%ile             │
│                                                           │
│  ── Idea Fingerprint ─────────────────────────           │
│  Topic novelty            ████████░░  78%ile             │
│  Problem difficulty       ██████████  94%ile             │
│                                                           │
│  ── Top topics (privacy-coarsened) ───────────────       │
│  mcp_tooling · x402 · onchain_settlement · hooks         │
│                                                           │
│  ── Current epoch ─────────────────────────────          │
│  Credits earned: 142 / 200 daily cap                     │
│  Projected payout: ~1.84 USDC                            │
└───────────────────────────────────────────────────────────┘
```

### What Contributors See That Nobody Else Does

The private version of the page includes:

- **Insight cards** — prose-level observations: "You converge 3× faster on debugging than the median. Your slowest sessions involve context accumulation — consider starting fresh sessions for unrelated tasks."
- **Trend deltas** — "Your verification discipline dropped from 58%ile to 41%ile this epoch. Relevant changes: more direct-Write sessions, fewer Read+Edit patterns."
- **Axis drill-downs** — click an axis, see the specific sessions that contributed to the score.

### Hive-Wide Surfaces

- **Leaderboards per axis.** Filterable by language, domain, time window. Not a global "top 10 contributors" board (too generic, too gameable).
- **Collective stats.** "Hive judgment median this week: ..." "Topics trending across the hive: ..."
- **Archetypes.** Clusters of contributor fingerprints with descriptive labels — "the Refactor Archaeologist," "the Infrastructure Sprinter." Joining an archetype is a soft identity, not a rank.

**TBD (Brian):** Is leaderboard a first-class surface, or a drill-down from the profile? First-class risks early cold-start dead-feel; drill-down may not hook users.

---

## 6. Quality-Weighted Aggregation (Back to B2B)

### The Feedback Loop

Once contributors have judgment scores, the backend can produce **tiered data products**:

| Product Tier | Filter | Example Query | Price Bump |
|--------------|--------|---------------|------------|
| Raw aggregate | All contributors | "React session share, 30d" | Base ($0.03) |
| Cohort-filtered | Top 25% judgment | "React session share among high-judgment users" | +50% ($0.05) |
| Elite cohort | Top 5% judgment, domain-filtered | "What do top-judgment backend devs think of Prisma vs Drizzle?" | +200% ($0.09) |

This is how the Hive makes the B2B data marketplace more valuable. Framework teams will pay more for signal from developers whose work ships and survives. It also re-aligns incentives: contributors want higher judgment scores not just for status, but because their signal is worth more in aggregate queries.

### Privacy Considerations

Quality-weighted queries must respect k-anonymity. If "top 5% backend React devs" resolves to < k (e.g., k=50) contributors, the query is blocked or degrades to a broader cohort.

### Implementation Sketch

- Judgment scores computed per-contributor per-epoch on the backend (not shipped to the hook).
- Contributor IDs remain opaque; scores are applied as weights during aggregate query resolution.
- Scores never expose which specific contributors are in a cohort — only aggregate statistics of the filtered set.

---

## 7. Cold Start Plan

**Problem:** Percentile rankings are meaningless with <50 contributors. First joiners see "#3 of 4" and bounce.

**Solutions in order of preference:**

### Option A — Synthetic Baselines from Public Corpora

Seed the cohort with benchmarks derived from public Claude Code transcripts, open-source project commit patterns, and anonymized dogfooding data. Early contributors see "you vs the archetype" rather than "you vs Kevin."

**Risk:** Synthetic baselines may not match real hook data statistical properties. Careful validation needed.

### Option B — Private Beta Threshold

Hive features (profile, leaderboards) remain locked until 100 contributors are active. Early signups see a waitlist with their own analytics, but no social layer.

**Risk:** Reduces early excitement; requires a credible path to 100 contributors before the social loop starts pulling.

### Option C — Hybrid (recommended)

Private beta mode from day 1, with synthetic baselines used to display "the archetype you most resemble" rather than absolute rankings. Real percentiles unlock at a threshold. Revenue share unlocks when Phase 4 x402 queries go live.

**TBD (Brian):** Target cohort size threshold? 100, 500, 1000? Depends on variance of judgment axes within the cohort.

---

## 8. Risks

### R1 — Measurement Error Erodes Trust

Judgment is squishy. Our score will be wrong for some contributors, and they will notice. Asymmetric: a single viral tweet about an unfair score can damage credibility for a long time.

**Mitigations:**
- Publish methodology. Let critics argue with specs, not outputs.
- Multiple axes. Never a single "judgment score."
- Conservative framing. "Fingerprint," "percentile on this axis," never "you are better than X."
- Private by default. Contributors opt into public profile. Rankings public but contributor identities pseudonymous.

### R2 — Gaming the Axes

Any scored behavior invites farming. Possible attacks:
- Trigger satisfaction signal artificially (git commits during sessions to look productive).
- Avoid risky sessions to keep judgment score high (chilling effect on exploration — bad).
- Coordinate cohorts (sybil rings inflating each other's percentiles — partially addressed by World ID).

**Mitigations:**
- Outcome-weighted scoring: convergence speed matters less than outcome-follow-through.
- Axis rotation: introduce new axes periodically; farmers optimize to last month's metric.
- Minimum activity diversity: can't be top 5% on only 10 sessions.
- Ignore axis for contributors with low session diversity.

### R3 — Privacy Creep

Adding a social layer increases the blast radius of any data leak. A profile page that shows topics, frameworks, and percentiles could leak proprietary work patterns.

**Mitigations:**
- All profile surface fields are opt-in per-category.
- Topic display coarsened identically to B2B-side coarsening (same pipeline).
- k-anonymity thresholds on any hive-wide surface.
- Red-team review before any public profile ships.

### R4 — The Thesis Could Be Wrong

"Idea and judgment are the new bottleneck" is a current-moment thesis. If AI plateau doesn't happen as predicted, or if the skill axes shift again within 18 months, this phase ages badly.

**Mitigations:**
- Axis set is not load-bearing for the backend. Axes are queries over data, not a schema change. New axes are a code change, not a migration.
- Publish axes as a versioned spec (like taxonomy v1.0). Evolve them visibly.

---

## 9. Open Questions (Brian Please Decide)

| # | Question | Options | Default |
|---|----------|---------|---------|
| Q1 | Leaderboard as first-class surface or drill-down? | First-class / drill-down only / not yet | Drill-down only for v1 |
| Q2 | Cohort size threshold before real percentiles unlock | 100 / 500 / 1000 | 500 |
| Q3 | Should profile pages be public-web or pollen-only? | Public (pollen.xyz/@name) / pollen dashboard only | Public |
| Q4 | World ID requirement — blocking for hive features? | Required from day 1 / optional / required only for earnings | Required for earnings, not for hive |
| Q5 | Archetype system — ship with v1 or later? | Ship with v1 / Phase 6 | Phase 6 |
| Q6 | Quality-weighted B2B queries — Phase 5 or Phase 6? | Together with Phase 5 / separate phase | Phase 5, but gated behind cohort size |

---

## 10. Phase Sequencing

Phase 5 sits after Phase 4 (payouts) but some pieces can run in parallel with Phase 3 (query API).

```
Phase 3 (Query API) ──┐
                      ├──→ Phase 5.1: MVP Profile + Axes (weeks 1-2)
Phase 4 (Payouts) ────┤          │
                      │          ├──→ Phase 5.2: Insight Cards (week 3)
                      │          │
                      │          ├──→ Phase 5.3: Quality-Weighted Queries (weeks 4-5)
                      │          │
                      └──→ Phase 5.4: Archetypes + Hive-wide Surfaces (weeks 6-7)
```

### Phase 5.1 — MVP Profile (weeks 1-2)

- Ship 6 derivable axes (J1, J2, J3, J4, I1, I4).
- Profile page (private, opt-in public).
- Percentile computation on backend, per-epoch.
- Cohort baseline: synthetic for first N contributors.

### Phase 5.2 — Insight Cards (week 3)

- LLM-generated natural-language observations on top of axis data.
- Trend deltas between epochs.
- Axis drill-downs (which sessions contributed).

### Phase 5.3 — Quality-Weighted B2B Queries (weeks 4-5)

- Backend: cohort filtering by judgment score.
- Pricing tier in x402 responses.
- k-anonymity enforcement on filtered queries.

### Phase 5.4 — Archetypes + Hive Surfaces (weeks 6-7)

- Clustering pipeline (I5 originality fingerprint becomes tractable once cohort > 500).
- Archetype labeling (LLM-assisted, manual review).
- Hive-wide trend surfaces.

---

## 11. Rewrite-vs-Extend Decision

This phase was the pretext for considering a full pollen-v2 rewrite. Given the axis design above, the answer becomes mechanical:

### What Survives From v1

- ✓ Hook pipeline (`packages/cli/src/hooks/*`) — axes J1–J5 and I1, I2, I4 all derive from existing capture.
- ✓ `coarsen.ts` + `terms.json` — topic extraction feeds I1, I2, I3.
- ✓ `store.ts` schema — contributions/tool_events/sessions/lifecycle_events already have the fields needed.
- ✓ Sync pipeline — `contributor_id` tagging is how axes attach to people.
- ✓ PollenToken + Settlement contracts — no changes needed.
- ✓ Neon backend — needs new views for cohort baselines and percentile computation, not new tables.

### What Needs Net-New Work

- ✗ Profile page (new site surface).
- ✗ Per-contributor axis computation (new backend job, per-epoch).
- ✗ Synthetic baseline seeding (new offline task).
- ✗ Quality-weighted query resolver (extension to x402 endpoints).
- ✗ Git-aftermath daemon for J6 (separate service, optional for MVP).

### What Should Be Deleted or Rewritten

- The 7 deleted `/api/trends/*` routes are consistent with this direction — they were single-contributor trend queries, superseded by cohort-weighted queries.
- Site single-user dashboard can gradually become the private contributor profile view. No rewrite; refactor.

### Conclusion

**No ground-up rewrite. Phase 5 is an extension of the existing codebase.** Total net-new code: roughly 30% of the current backend surface, essentially zero in the hook path. The framing of "pollen-v2" was premature — the existing code maps cleanly to this vision.

---

## 12. What To Do After This Doc

1. Brian reviews, fills in TBDs, disagrees with whatever needs disagreement.
2. Walk through the 6 MVP axes one at a time and lock specs.
3. Write `docs/AXIS-SPEC.md` with precise definitions and test cases for each.
4. Build cohort-baseline infrastructure first (no contributor-facing work until baselines exist).
5. Ship Phase 5.1 MVP behind feature flag. Dogfood on the first 10 contributors.

**Not in this phase:**
- Advanced idea axes (I3, I5) — Phase 6.
- MCP-side hive features — whenever MCP layer ships (existing Phase 5 in PLAN.md).
- On-chain reputation tokens — not before Phase 6 at earliest.
