# Pollen Phase 0: Implementation Plan

## Context

We're building Phase 0 of Pollen — a local-only prompt intelligence prototype that runs on Brian's Claude Code sessions. The goal is to validate whether prompt usage data is interesting enough to build a product around. No server, no uploads, no npm publishing — just a hook, a classifier, a SQLite DB, and a query CLI.

**Repo:** `~/pollen/` (initialized, docs committed)
**Spec:** `~/pollen/docs/PHASE-0.md`

## Architecture

```
Claude Code UserPromptSubmit hook
  → node ~/pollen/packages/cli/dist/hook.js
    → reads JSON from stdin (has user_prompt field)
    → extracts features (keywords, language, structure, etc.)
    → classifies intent (heuristic rules)
    → stores features + labels in SQLite (~/.pollen/local.db)
    → outputs {"continue": true} to stdout

Later, user runs:
  pollen stats / intents / languages / sessions / tools / when / trends
    → queries SQLite → renders ASCII output
```

## Monorepo Setup

**Tools:** pnpm 10.28.0, Node 24.7.0, turbo, vitest, biome, tsc

**Files to create:**

| File | Purpose |
|------|---------|
| `~/pollen/package.json` | Root: private, scripts for build/test/lint via turbo |
| `~/pollen/pnpm-workspace.yaml` | Workspace: `packages/*` |
| `~/pollen/turbo.json` | Task config: build, test, dev, clean |
| `~/pollen/tsconfig.json` | Base: ES2022, strict, bundler moduleResolution |
| `~/pollen/biome.json` | Formatting: single quotes, semicolons, 2-space indent |
| `~/pollen/packages/cli/package.json` | CLI package: better-sqlite3, vitest, tsx |
| `~/pollen/packages/cli/tsconfig.json` | Extends root, outDir: dist, rootDir: src |
| `~/pollen/packages/cli/vitest.config.ts` | Test config: node env, glob `src/**/*.test.ts` |

**Single runtime dependency:** `better-sqlite3` (synchronous SQLite — perfect for a hook that needs to be fast).

## Implementation Order (8 modules, tests-first)

Build each module, write its tests, verify green before moving to the next.

### Step 1: `src/types.ts` — Shared type definitions

- `RawFeatures` interface (Layer 1: keywords, tools_chain, language_signals, etc.)
- `DerivedLabels` interface (Layer 2: intent, complexity, prompt_style, domain)
- `Intent` type union (9 categories)
- `Contribution` interface (id, timestamp, session_id, features, labels)
- `HookInput` interface (session_id, user_prompt, cwd, etc.)
- No tests needed — pure types

### Step 2: `data/terms.json` — Programming term dictionary

JSON dictionary with categories:
- `error_terms`: TypeError, ENOENT, stack trace, panic, etc.
- `build_terms`: add, create, build, implement, scaffold, etc.
- `refactor_terms`: refactor, rename, extract, move, simplify, etc.
- `learning_terms`: how, what, why, explain, understand, etc.
- `devops_terms`: deploy, docker, ci, pipeline, kubernetes, etc.
- `testing_terms`: test, spec, assert, expect, mock, vitest, etc.
- `doc_terms`: doc, readme, comment, jsdoc, changelog, etc.
- `review_terms`: review, pr, diff, approve, merge, etc.
- `tool_names`: Read, Edit, Bash, Grep, Glob, Write, etc.
- `languages`: map of language name → matching terms
- `frameworks`: map of framework name → matching terms

### Step 3: `src/features.ts` + `src/features.test.ts` — Feature extraction

**Functions:**
- `extractKeywords(text, terms)` → string[] of matched programming terms
- `extractToolsChain(text)` → string[] of tool names mentioned
- `extractLanguageSignals(text, terms)` → string[] of language names
- `extractFrameworks(text, terms)` → string[] of framework names
- `classifyPromptLength(text)` → short (<25 words) | medium (25-100) | long (100+)
- `computeCodeRatio(text)` → none | low | medium | high (based on ``` block chars)
- `classifyStructureType(text)` → imperative | question | error_paste | context_dump | conversation
- `detectErrorTrace(text)` → boolean (regex for stack traces, TypeError, Traceback, etc.)
- `detectCodeBlock(text)` → boolean
- `getTimeBucket(date)` → { day_of_week, hour_bucket }
- `extractFeatures(text, timestamp)` → RawFeatures (orchestrator)

**Key tests (12+ cases):**
- Prompt length bucketing (short/medium/long + boundary at 25)
- Code ratio with no code, all code, mixed
- Structure type detection (question mark, imperative verb, error trace, code dump)
- Error trace detection (JS stack, Python traceback, clean prompt)
- Keyword extraction across categories
- Language/framework signal detection
- Time bucket calculation (morning/afternoon/evening/night boundaries)

### Step 4: `src/session.ts` + `src/session.test.ts` — Session depth

**Pure function only** (since each hook invocation is a separate process, no in-memory state):
- `coarsenDepth(promptIndex)` → first (1) | early (2-5) | mid (6-15) | deep (16+)

Session prompt count comes from the DB (Step 5), not from memory.

**Tests:** 6 cases covering each bucket + boundaries (1, 5, 15, 16)

### Step 5: `src/store.ts` + `src/store.test.ts` — SQLite storage

**Functions:**
- `initDb(dbPath?)` → opens/creates DB, runs CREATE TABLE IF NOT EXISTS, enables WAL mode
- `insertContribution(db, contribution)` → INSERT with JSON.stringify for array fields
- `getSessionPromptCount(db, sessionId)` → SELECT COUNT for session depth tracking
- `queryIntentDistribution(db, { days? })` → GROUP BY intent
- `queryLanguageDistribution(db)` → json_each() on language_signals
- `queryToolUsage(db)` → json_each() on tools_chain
- `querySessionStats(db)` → avg prompts/session, common flows
- `queryTimePatterns(db)` → GROUP BY hour_bucket, day_of_week
- `queryTrends(db, period)` → GROUP BY date, show changes over time
- `getStats(db)` → total count, date range, unique sessions

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  session_id TEXT,
  keywords TEXT, tools_chain TEXT, language_signals TEXT, frameworks TEXT,
  prompt_length TEXT, code_ratio TEXT, structure_type TEXT, session_depth TEXT,
  has_error_trace INTEGER, has_code_block INTEGER, day_of_week TEXT, hour_bucket TEXT,
  intent TEXT, sub_intent TEXT, complexity TEXT, prompt_style TEXT,
  domain TEXT, taxonomy_version TEXT DEFAULT 'v1.0', confidence REAL
);
```

**Tests (10+ cases):** All use `:memory:` SQLite (no temp files):
- Table creation, insert + read back, JSON array round-trip
- Session prompt count (empty, after inserts)
- Intent distribution with multiple intents
- json_each() works for language/tool queries
- Time pattern grouping
- Overall stats

### Step 6: `src/classify.ts` + `src/classify.test.ts` — Intent classifier

**Functions:**
- `classifyIntent(features)` → { intent, confidence } — priority rule chain:
  1. has_error_trace OR error keywords → debugging (0.9)
  2. imperative + build keywords → feature_build (0.85)
  3. refactor keywords → refactoring (0.85)
  4. question + learning keywords → learning (0.8)
  5. devops keywords → devops (0.85)
  6. testing keywords → testing (0.85)
  7. doc keywords → documentation (0.85)
  8. review keywords → code_review (0.85)
  9. fallback → exploration (0.5)
- `classifyComplexity(features)` → simple | moderate | complex
- `classifyPromptStyle(features)` → directive | conversational | context_heavy | minimal
- `classifyDomain(features)` → web_frontend | web_backend | devops | data | systems | general
- `classify(features)` → full DerivedLabels (orchestrator)

**Tests (11+ cases):**
- Each intent category with representative features
- Priority: error trace beats refactor keywords (debugging wins)
- Fallback to exploration with unknown keywords
- Complexity bucketing
- Domain detection from frameworks

### Step 7: `src/query.ts` + `src/query.test.ts` — CLI rendering

**Pure functions** (data in, string out — no DB access):
- `renderStats(stats)` → summary dashboard string
- `renderIntents(intents)` → ASCII bar chart with percentages
- `renderLanguages(languages)` → bar chart
- `renderSessions(sessions)` → avg, longest, common flow
- `renderTools(tools)` → tool usage bars
- `renderWhen(patterns)` → peak hours, productive day
- `renderTrends(trends, period)` → time-series table
- Helper: `bar(ratio, width)` → ████░░░░ string

**Tests (6+ cases):**
- Bar chart rendering (50%, 0%, 100%)
- Intent formatting with real data
- Empty data → "No data yet" message
- Peak detection in time patterns

### Step 8: `src/hook.ts` + `src/hook.test.ts` — Hook entry point

**The pipeline orchestrator:**
1. Read JSON from stdin → parse HookInput
2. `extractFeatures(input.user_prompt, now)`
3. `getSessionPromptCount(db, input.session_id)` → `coarsenDepth()` → set session_depth
4. `classify(features)` → DerivedLabels
5. `insertContribution(db, { id: randomUUID(), features, labels })`
6. Output `{"continue": true}` to stdout
7. **Fail silently on any error** — never block Claude Code

**Tests (5 cases):**
- Full pipeline: debugging prompt → stored with intent=debugging
- Full pipeline: feature build prompt → stored correctly
- Session depth: same session_id 3x → depths are first, early, early
- Empty prompt → stores as exploration, doesn't throw
- Malformed input → doesn't throw

### Step 9: `src/main.ts` — CLI entry point

Thin routing layer:
```
pollen stats       → store.getStats() → query.renderStats()
pollen intents     → store.queryIntentDistribution() → query.renderIntents()
pollen languages   → store.queryLanguageDistribution() → query.renderLanguages()
pollen sessions    → store.querySessionStats() → query.renderSessions()
pollen tools       → store.queryToolUsage() → query.renderTools()
pollen when        → store.queryTimePatterns() → query.renderWhen()
pollen trends      → store.queryTrends() → query.renderTrends()
```

No tests — thin routing, all logic tested in store + query modules.

### Step 10: `src/integration.test.ts` — End-to-end test

- Simulates 9 different prompt types (one per intent category), runs each through features → classify → store, verifies all stored correctly
- Tests session depth tracking across multiple prompts in same session
- Tests query functions return correct aggregates after seeding data

### Step 11: Install hook into Claude Code

Add to `~/.claude/settings.json` inside existing `hooks` object:

```json
"UserPromptSubmit": [
  {
    "matcher": "*",
    "hooks": [
      {
        "type": "command",
        "command": "node /Users/brianflynn/pollen/packages/cli/dist/hook.js",
        "timeout": 10
      }
    ]
  }
]
```

## Dependency Graph

```
Step 1 (types) ──┬──→ Step 3 (features) ──→ Step 6 (classify) ──┐
                 ├──→ Step 4 (session)                           ├──→ Step 8 (hook)
Step 2 (terms) ──┘                                               │     Step 9 (main)
                 └──→ Step 5 (store) ──→ Step 7 (query) ────────┘     Step 10 (integration)
                                                                        Step 11 (install hook)
```

Steps 1+2 are independent. Steps 3, 4, 5 can be parallelized after 1+2. Steps 6+7 can be parallelized after 3+5. Steps 8-11 are sequential.

## Verification

1. **Unit tests:** `cd ~/pollen && pnpm test` — all tests green
2. **Build:** `pnpm build` — produces `dist/hook.js` and `dist/main.js`
3. **Manual hook test:** After installing hook + restarting Claude Code, send a prompt, then:
   ```bash
   sqlite3 ~/.pollen/local.db "SELECT intent, COUNT(*) FROM contributions GROUP BY intent"
   ```
4. **CLI test:** `node ~/pollen/packages/cli/dist/main.js stats` — shows captured data
5. **5-day validation:** Use Claude Code normally, then run `pollen intents` and `pollen sessions` to see if the patterns are interesting
