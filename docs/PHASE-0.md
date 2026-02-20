# Phase 0: Validate

> **Goal:** Prove the data is interesting before building anything else.
>
> **Duration:** 1 week
>
> **Gate:** "Would someone pay for this?"

## What We're Building

A local-only prototype that runs on YOUR Claude Code sessions. No server, no uploads, no npm package. Just a hook, a classifier, a SQLite database, and a query CLI.

```
Claude Code
    │
    ▼ (UserPromptSubmit hook)
┌──────────────────────────────────┐
│  pollen-hook.sh                   │
│  Captures prompt text             │
│  Passes to classifier             │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  classify.ts                      │
│  Extract raw features             │
│  Run local intent classification  │
│  Coarsen features (bucketize)     │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  SQLite (local)                   │
│  contributions table              │
│  (features + labels)              │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  query.ts                         │
│  "What did I prompt about?"       │
│  "Top intents this week?"         │
│  "How do my sessions look?"       │
└──────────────────────────────────┘
```

## Deliverables

### 1. Claude Code Hook (`hooks/prompt-capture.sh`)

- Listens on `UserPromptSubmit` event
- Receives the prompt text from stdin (Claude Code hook protocol)
- Pipes to the classifier process
- Must be fast (<100ms) to not block Claude Code

**Hook config** (in `.claude/settings.json`):
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "node /path/to/pollen/packages/cli/dist/hook.js"
      }
    ]
  }
}
```

### 2. Feature Extractor (`packages/cli/src/features.ts`)

Extracts Layer 1 raw features from prompt text:

| Feature | Extraction Method |
|---------|------------------|
| keywords | Tokenize, match against programming term dictionary |
| tools_chain | Match tool names (Read, Edit, Bash, Grep, Glob, Write) |
| language_signals | Match file extensions, language names, framework names |
| frameworks | Match framework-specific terms (useState, app.get, etc.) |
| prompt_length | Word count → bucket (short/medium/long) |
| code_ratio | Count chars inside ``` blocks / total chars → bucket |
| structure_type | Heuristic: starts with error? question mark? imperative verb? |
| session_depth | Track prompt index per session (reset on new session) |
| has_error_trace | Regex: stack trace patterns, "Error:", "TypeError:", etc. |
| has_code_block | Contains ``` delimiters |
| day_of_week | From timestamp |
| hour_bucket | From timestamp → 6h bucket |

### 3. Local Classifier (`packages/cli/src/classify.ts`)

**Phase 0 approach: heuristic-based (no LLM needed)**

For validation, we don't need a model. Simple keyword + structure rules:

```
IF has_error_trace OR keywords include error terms → intent: debugging
IF structure_type == "imperative" AND keywords include "add/create/build" → intent: feature_build
IF keywords include "refactor/rename/extract/move" → intent: refactoring
IF structure_type == "question" AND keywords include "how/what/why/explain" → intent: learning
IF keywords include "deploy/docker/ci/pipeline" → intent: devops
IF keywords include "test/spec/assert/expect" → intent: testing
IF keywords include "doc/readme/comment/jsdoc" → intent: documentation
IF keywords include "review/pr/diff/approve" → intent: code_review
ELSE → intent: exploration
```

Confidence: 0.9 for strong keyword matches, 0.5 for fallback.

**Phase 1 upgrade path:** Replace heuristics with bundled small model (ONNX runtime, ~50MB).

### 4. SQLite Storage (`packages/cli/src/store.ts`)

```sql
CREATE TABLE contributions (
  id              TEXT PRIMARY KEY,
  timestamp       INTEGER NOT NULL,

  -- Layer 1: Raw features (coarsened)
  keywords        TEXT,               -- JSON array
  tools_chain     TEXT,               -- JSON array
  language_signals TEXT,              -- JSON array
  frameworks      TEXT,               -- JSON array
  prompt_length   TEXT,               -- short | medium | long
  code_ratio      TEXT,               -- none | low | medium | high
  structure_type  TEXT,
  session_depth   TEXT,               -- first | early | mid | deep
  has_error_trace INTEGER,            -- 0 | 1
  has_code_block  INTEGER,            -- 0 | 1
  day_of_week     TEXT,
  hour_bucket     TEXT,

  -- Layer 2: Derived labels
  intent          TEXT,
  sub_intent      TEXT,
  complexity      TEXT,
  prompt_style    TEXT,
  domain          TEXT,
  taxonomy_version TEXT DEFAULT 'v1.0',
  confidence      REAL
);

CREATE INDEX idx_intent ON contributions(intent);
CREATE INDEX idx_timestamp ON contributions(timestamp);
CREATE INDEX idx_language ON contributions(language_signals);
```

**Location:** `~/.pollen/local.db`

### 5. Local Query CLI (`packages/cli/src/query.ts`)

Commands for exploring your own data:

```bash
# Summary of all prompts
pollen stats

# Intent distribution
pollen intents
# Output:
#   debugging      42%  ████████████████░░░░  (127 prompts)
#   feature_build  28%  ███████████░░░░░░░░░  (85 prompts)
#   learning       12%  █████░░░░░░░░░░░░░░░  (36 prompts)
#   ...

# Language breakdown
pollen languages

# Session patterns
pollen sessions
# Output:
#   Avg session: 8.3 prompts
#   Most common flow: exploration → feature_build → debugging
#   Longest sessions: debugging (avg 12.4 prompts)

# Daily/weekly trends
pollen trends --period week

# Tool usage
pollen tools
# Output:
#   Most common chain: Read → Edit → Bash (34%)
#   Most used: Read (89% of sessions)
#   Least used: NotebookEdit (2%)

# Time patterns
pollen when
# Output:
#   Peak hours: afternoon (48%)
#   Most productive day: Tuesday
#   Weekend usage: 12%
```

## File Structure

```
pollen/
├── packages/
│   └── cli/
│       ├── src/
│       │   ├── hook.ts           # Claude Code hook handler
│       │   ├── features.ts       # Feature extraction
│       │   ├── classify.ts       # Heuristic classifier (Phase 0)
│       │   ├── store.ts          # SQLite read/write
│       │   ├── query.ts          # Local query CLI
│       │   └── session.ts        # Session tracking (prompt index)
│       ├── data/
│       │   └── terms.json        # Programming term dictionary
│       ├── package.json
│       └── tsconfig.json
├── docs/
│   ├── PLAN.md
│   ├── PHASE-0.md               # ← you are here
│   ├── PHASE-1.md
│   ├── PHASE-2.md
│   ├── PHASE-3.md
│   └── PHASE-4.md
└── package.json                  # Monorepo root (turborepo)
```

## Success Criteria

After 5 days of running on your own Claude Code usage:

- [ ] **Volume:** Captured 200+ prompts across multiple sessions
- [ ] **Classification accuracy:** Spot-check 20 random entries, >80% correctly classified
- [ ] **Interesting patterns:** Can answer 5+ non-obvious questions about your own usage
- [ ] **Demo-ready:** Can show another developer the query output and they say "I'd want to see mine"
- [ ] **No performance impact:** Claude Code doesn't feel slower with the hook active

## What We're NOT Building in Phase 0

- No server / API
- No npm package publishing
- No World ID
- No x402 payments
- No MCP server
- No anonymization pipeline (it's your own data, on your own machine)
- No fancy UI

This is a validation exercise. If the data isn't interesting, we stop here.
