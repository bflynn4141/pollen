# Phase 1: Collector + API

> **Goal:** Ship the npm package and stand up the server that receives contributions.
>
> **Duration:** 2 weeks
>
> **Gate:** 10 contributors uploading data
>
> **Depends on:** Phase 0 validated ("the data is interesting")

## What Changes from Phase 0

| Phase 0 (local only) | Phase 1 (networked) |
|----------------------|---------------------|
| Hook runs locally, stores in SQLite | Hook uploads to Pollen API |
| No anonymization needed (own data) | Full PII scrub + feature coarsening |
| Heuristic classifier | Upgraded classifier (ONNX or improved heuristics) |
| Manual hook setup | `npx pollen init` installer |
| No auth | Wallet-based contributor auth |

## Deliverables

### 1. npm Package: `pollen-cli`

**Install + onboarding:**
```bash
npx pollen init
```

This command:
1. Creates `~/.pollen/` config directory
2. Prompts for wallet address (for future payouts)
3. Generates a contributor keypair (for signing uploads)
4. Installs the Claude Code hook into `.claude/settings.json`
5. Runs a test capture to verify the hook works
6. Prints: "You're now a pollinator. Run `pollen stats` anytime."

**CLI commands:**
```bash
pollen init          # Onboarding
pollen stats         # Local summary (same as Phase 0)
pollen intents       # Intent distribution
pollen pause         # Temporarily stop capturing
pollen resume        # Resume capturing
pollen status        # Show capture state + upload stats
pollen export        # Export your own data as JSON
pollen delete        # Delete all local data + uninstall hook
```

**Package constraints (supply chain hardening):**
- Zero postinstall scripts
- Minimal dependencies (target <10 direct deps)
- Lockfile committed
- npm provenance enabled (Sigstore)
- Published with `--provenance` flag

### 2. Local Processing Pipeline (upgraded)

```
Prompt captured by hook
  │
  ├─ PII Scrub (local)
  │   ├─ Regex: emails, URLs, IP addresses
  │   ├─ Regex: file paths (/Users/*, ./src/*, C:\*)
  │   ├─ Entropy scanner: high-entropy strings (API keys, tokens)
  │   ├─ Hex strings > 20 chars (addresses, hashes)
  │   ├─ Quoted strings > 50 chars (likely code/data)
  │   └─ User-defined blocklist (~/.pollen/blocklist.txt)
  │
  ├─ Feature Extraction
  │   └─ (same as Phase 0, all features coarsened/bucketized)
  │
  ├─ Classification
  │   └─ Upgraded: ONNX runtime with small model (~50MB)
  │      OR improved heuristic rules based on Phase 0 learnings
  │
  ├─ Coarsening
  │   ├─ Drop any feature with <5 global occurrences (rare = identifying)
  │   ├─ Bucketize all numeric values
  │   └─ Generalize framework versions (react@19 → react)
  │
  └─ Upload Batch
      ├─ Batch: 10 contributions OR 30 minutes, whichever first
      ├─ Sign batch with contributor key
      ├─ Encrypt in transit (HTTPS + request signing)
      ├─ Include nonce + timestamp (replay protection)
      └─ Retry with exponential backoff on failure
```

### 3. Cloudflare Worker API (`packages/api/`)

**Endpoints:**

```
POST /v1/contribute
  Body: { batch: Contribution[], signature: string, nonce: string, timestamp: number }
  Auth: Contributor key signature verification
  Response: { accepted: number, rejected: number, reasons: string[] }

GET /v1/contributor/:id/stats
  Auth: Contributor key
  Response: { total_contributions, this_week, earnings_to_date }

POST /v1/contributor/register
  Body: { wallet_address, public_key }
  Response: { contributor_id }

GET /v1/health
  Response: { status, contributors, contributions_today }
```

**Server responsibilities:**
- Verify request signatures (no spoofing)
- Verify nonce + timestamp (no replay)
- Validate feature schemas (reject malformed data)
- Store in D1 (layered: features + labels)
- Rate limit per contributor (200/day, 1/30s)
- Dedup identical feature vectors within 1h window
- Reject contributions with confidence < 0.5
- Aggregate stats for contributor dashboard

**What the server NEVER receives:**
- Prompt text (not even "anonymized" prompt text)
- File paths, project names, repo URLs
- Code content of any kind
- Exact timestamps (only day_of_week + hour_bucket)

### 4. D1 Schema

```sql
-- Contributions (layered)
CREATE TABLE contributions (
  id                TEXT PRIMARY KEY,
  contributor_id    TEXT NOT NULL,
  received_at       INTEGER NOT NULL,

  -- Layer 1: Coarsened features
  keywords          TEXT,
  tools_chain       TEXT,
  language_signals  TEXT,
  frameworks        TEXT,
  prompt_length     TEXT,
  code_ratio        TEXT,
  structure_type    TEXT,
  session_depth     TEXT,
  has_error_trace   INTEGER,
  has_code_block    INTEGER,
  day_of_week       TEXT,
  hour_bucket       TEXT,

  -- Layer 2: Derived labels
  intent            TEXT,
  sub_intent        TEXT,
  complexity        TEXT,
  prompt_style      TEXT,
  domain            TEXT,
  taxonomy_version  TEXT DEFAULT 'v1.0',
  confidence        REAL,

  -- Anti-spam
  feature_hash      TEXT,
  FOREIGN KEY (contributor_id) REFERENCES contributors(id)
);

-- Contributors
CREATE TABLE contributors (
  id                TEXT PRIMARY KEY,
  wallet_address    TEXT NOT NULL,
  public_key        TEXT NOT NULL,
  registered_at     INTEGER NOT NULL,
  total_contributions INTEGER DEFAULT 0,
  today_contributions INTEGER DEFAULT 0,
  today_date        TEXT,
  status            TEXT DEFAULT 'active'
);

-- Indexes
CREATE INDEX idx_contrib_contributor ON contributions(contributor_id);
CREATE INDEX idx_contrib_intent ON contributions(intent);
CREATE INDEX idx_contrib_received ON contributions(received_at);
CREATE INDEX idx_contrib_hash ON contributions(feature_hash);
```

### 5. Contributor Workspace Controls

Users can configure what gets captured:

**`~/.pollen/config.json`:**
```json
{
  "capture": {
    "enabled": true,
    "workspaces": {
      "mode": "allowlist",
      "paths": [
        "~/projects/open-source/*",
        "~/personal/*"
      ]
    },
    "blocklist_terms": [
      "company-internal",
      "secret-project"
    ],
    "pause_until": null
  },
  "contributor": {
    "wallet_address": "0x...",
    "contributor_id": "..."
  }
}
```

- **Default: capture OFF.** Must explicitly opt-in per workspace.
- **Allowlist mode:** Only capture in listed directories.
- **Blocklist terms:** Skip any prompt containing these terms.
- **Pause:** Temporarily disable without uninstalling.

## File Structure Additions

```
pollen/
├── packages/
│   ├── cli/                      # Contributor package
│   │   ├── src/
│   │   │   ├── hook.ts           # Hook handler (from Phase 0)
│   │   │   ├── features.ts       # Feature extraction (from Phase 0)
│   │   │   ├── classify.ts       # Classifier (upgraded)
│   │   │   ├── store.ts          # Local SQLite (from Phase 0)
│   │   │   ├── query.ts          # Local query CLI (from Phase 0)
│   │   │   ├── session.ts        # Session tracking (from Phase 0)
│   │   │   ├── init.ts           # NEW: Onboarding flow
│   │   │   ├── sanitize.ts       # NEW: PII scrubbing
│   │   │   ├── coarsen.ts        # NEW: Feature coarsening
│   │   │   ├── upload.ts         # NEW: Batch upload + signing
│   │   │   ├── auth.ts           # NEW: Keypair management
│   │   │   └── config.ts         # NEW: Workspace config
│   │   └── package.json
│   │
│   └── api/                      # NEW: Cloudflare Worker
│       ├── src/
│       │   ├── index.ts          # Router
│       │   ├── contribute.ts     # Ingest endpoint
│       │   ├── verify.ts         # Signature + nonce verification
│       │   ├── antispam.ts       # Dedup, rate limit, confidence check
│       │   ├── contributor.ts    # Registration + stats
│       │   └── health.ts         # Health check
│       └── wrangler.toml
│
├── docs/
└── package.json
```

## Success Criteria

- [ ] `npx pollen init` works end-to-end in < 2 minutes
- [ ] Hook captures prompts without blocking Claude Code (<100ms)
- [ ] PII scrub catches 95%+ of emails, API keys, file paths
- [ ] Upload batches successfully reach the API
- [ ] API rejects replayed/spoofed requests
- [ ] Rate limiting prevents > 200 contributions/day per contributor
- [ ] 10 real contributors onboarded and uploading
- [ ] `pollen stats` shows both local + server-side stats
- [ ] `pollen delete` cleanly removes all data and hooks
