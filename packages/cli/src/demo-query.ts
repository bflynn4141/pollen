/**
 * Demo REPL — natural language query interface for Pollen data.
 *
 * x402 buyer experience: ask a question in plain English,
 * Sonnet generates a SQL query, executes it, and displays results with
 * a real x402 payment receipt — EIP-712 signed, server-verified.
 *
 * Run: POLLEN_DEMO_KEY=0x... node packages/cli/dist/demo-query.js
 */
import { createInterface } from 'node:readline'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { privateKeyToAccount } from 'viem/accounts'
import { initDb } from './store.js'
import { DB_PATH } from './config.js'
import { signX402Payment, USDC_BASE } from './x402.js'
import type Database from 'better-sqlite3'

// ── Colors ──────────────────────────────────────────────
const C = '\x1b[38;2;184;115;51m' // copper
const G = '\x1b[32m'              // green
const D = '\x1b[2m'               // dim
const B = '\x1b[1m'               // bold
const R = '\x1b[0m'               // reset
const CY = '\x1b[36m'             // cyan
const Y = '\x1b[33m'              // yellow
const W = '\x1b[37m'              // white

// ── x402 Constants ──────────────────────────────────────
const POLLEN_API = process.env.POLLEN_API_URL || 'https://clara-proxy.bflynn4141.workers.dev'

// Contract addresses: env-first, falling back to the v2 keys in
// contracts/deployments/base-mainnet.json (populated by the v2 deploy).
const DEPLOYMENTS_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../contracts/deployments/base-mainnet.json',
)

function deploymentAddress(key: 'pollenTokenV2' | 'pollenSettlementV2'): string | null {
  try {
    const json = JSON.parse(readFileSync(DEPLOYMENTS_PATH, 'utf-8')) as Record<string, unknown>
    const contracts = (json.contracts ?? {}) as Record<string, unknown>
    const entry = contracts[key] ?? json[key]
    const addr = typeof entry === 'string' ? entry : (entry as { address?: unknown } | undefined)?.address
    return typeof addr === 'string' && /^0x[0-9a-fA-F]{40}$/.test(addr) ? addr : null
  } catch {
    return null
  }
}

function resolveAddress(envVar: 'POLLEN_TOKEN_ADDRESS' | 'POLLEN_SETTLEMENT_ADDRESS', deploymentKey: 'pollenTokenV2' | 'pollenSettlementV2'): `0x${string}` {
  const fromEnv = process.env[envVar]
  if (fromEnv) return fromEnv as `0x${string}`
  const fromFile = deploymentAddress(deploymentKey)
  if (fromFile) return fromFile as `0x${string}`
  throw new Error(
    `${envVar} is not set and contracts/deployments/base-mainnet.json has no "${deploymentKey}" entry. ` +
    `Deploy the v2 contracts (which writes that key) or export ${envVar}=0x...`,
  )
}

// ── x402 Wallet Setup ───────────────────────────────────
const demoKey = process.env.POLLEN_DEMO_KEY
let account: ReturnType<typeof privateKeyToAccount> | null = null
let POLLEN_SETTLEMENT: `0x${string}` | null = null

if (demoKey) {
  // x402 payments settle against PollenSettlementV2 — resolve it up front so a
  // missing address fails loudly instead of at payment time.
  try {
    POLLEN_SETTLEMENT = resolveAddress('POLLEN_SETTLEMENT_ADDRESS', 'pollenSettlementV2')
  } catch (err) {
    console.error((err as Error).message)
    process.exit(1)
  }
  account = privateKeyToAccount(demoKey as `0x${string}`)
}

const x402Enabled = !!account

// ── Schema Context ──────────────────────────────────────
const SCHEMA_CONTEXT = `
You have access to a SQLite database with anonymized developer behavior data from Claude Code users.
No raw prompt text is stored — only coarsened features and labels.

## Tables

### contributions
One row per prompt submitted by a developer.
- id TEXT PRIMARY KEY
- timestamp INTEGER (unix ms)
- session_id TEXT
- contributor_id TEXT (anonymized user ID — enables cross-session analytics)
- keywords TEXT (JSON array of extracted keywords)
- tools_chain TEXT (JSON array)
- language_signals TEXT (JSON array, e.g. ["typescript", "python"])
- frameworks TEXT (JSON array, e.g. ["react", "nextjs", "prisma", "hono", "trpc", "astro"])
- prompt_length TEXT (bucket: "tiny", "short", "medium", "long", "huge")
- code_ratio TEXT ("none", "low", "medium", "high")
- structure_type TEXT ("imperative", "question", "error_paste", "code_heavy", "mixed")
- session_depth TEXT ("first", "early", "mid", "deep")
- has_error_trace INTEGER (0 or 1)
- has_code_block INTEGER (0 or 1)
- day_of_week TEXT (e.g. "Monday")
- hour_bucket TEXT (e.g. "morning", "afternoon", "evening", "night")
- intent TEXT ("debugging", "feature_build", "refactoring", "exploration", "learning", "devops", "testing", "documentation", "code_review")
- complexity TEXT ("simple", "moderate", "complex")
- prompt_style TEXT
- domain TEXT ("web_frontend", "web_backend", "devops", "data", "systems", "general")
- permission_mode TEXT (e.g. "default", "plan", "bypassPermissions" — vibecoders love "bypassPermissions")
- action TEXT ("fix", "create", "update", "deploy", "test", "refactor", "setup", "understand", "review", "optimize", "migrate", "integrate", "design", "monitor", "remove")
- topic TEXT ("auth", "database", "api", "infra", "ui", "testing", "performance", "security", "ai", "cli", "web3", "payments", "email", "scheduling", "mobile", "design", "docs", "git", etc.)

### tool_events
One row per tool call made by Claude Code during a session.
- id TEXT PRIMARY KEY
- session_id TEXT
- timestamp INTEGER (unix ms)
- contributor_id TEXT
- tool_name TEXT (e.g. "Read", "Edit", "Bash", or MCP tools like "mcp__clara__wallet_send")
- tool_category TEXT ("read", "write", "execute", "search", "interact", "unknown")
- success INTEGER (0 or 1)
- error_category TEXT (null if success, e.g. "syntax", "runtime", "permission", "not_found", "timeout", "test_failure", "build_failure")
- file_extension TEXT (e.g. ".ts", ".py")
- command_category TEXT (for Bash: "git", "npm", "test", "build", etc.)
- sequence_number INTEGER
- mcp_server TEXT (extracted server name if MCP tool, else null)
- duration_ms INTEGER (reserved — not populated yet)
- response_type TEXT ("file_content", "search_results", "code_generated", "command_output", "error_output", "web_content", "confirmation", "empty", "unknown")
- response_size INTEGER (bytes of response, nullable)
- response_file_paths INTEGER (count of file paths in response)
- response_has_code INTEGER (0 or 1, response contains code blocks)
- response_has_error INTEGER (0 or 1, response contains error text)
- response_summary TEXT (first 200 chars of response, PII-stripped)

IMPORTANT — Tool categories:
- Built-in tools (Read, Write, Edit, Bash, Grep, Glob, Task, ToolSearch, WebFetch, WebSearch, Skill, AskUserQuestion, EnterPlanMode, ExitPlanMode, NotebookEdit) are standard Claude Code tools — boring and generic.
- MCP tools (where mcp_server IS NOT NULL) are the INTERESTING ones — they represent external integrations like wallets, design tools, social platforms, etc.
- When asked about "interesting" or "unique" tools, ALWAYS filter to mcp_server IS NOT NULL.
- Known MCP servers: clara (wallet), paper (design), figma (design), herd (portfolio), signal402 (x402 payments), vibe (social), glorp (messaging), conway-terminal (sandboxes), typefully (social publishing), paymodel (AI models).

### x402_events
One row per x402 payment-related tool call (subset of tool_events for payment protocol calls).
- id TEXT PRIMARY KEY
- session_id TEXT
- timestamp INTEGER (unix ms)
- contributor_id TEXT
- tool_name TEXT
- mcp_server TEXT (e.g. "x402", "signal402", "x402-agent", "x402-tokenization")
- service_url TEXT (the URL/endpoint being called, nullable)
- service_name TEXT (the service/hostname being paid, nullable)
- success INTEGER (0 or 1)

### lifecycle_events
One row per lifecycle event (subagent orchestration, context compaction, notifications).
- id TEXT PRIMARY KEY
- session_id TEXT
- timestamp INTEGER (unix ms)
- event_type TEXT ("subagent_start", "subagent_stop", "pre_tool_use", "notification", "pre_compact")
- parent_event_id TEXT (links stop to start events)
- metadata TEXT (JSON with event-specific fields)
- contributor_id TEXT

### sessions
One row per Claude Code session.
- session_id TEXT PRIMARY KEY
- contributor_id TEXT
- model TEXT
- started_at INTEGER (unix ms)
- ended_at INTEGER (unix ms, null if ongoing)
- duration_bucket TEXT ("quick", "short", "medium", "long", "marathon")
- prompt_count INTEGER
- tool_use_count INTEGER
- tool_failure_count INTEGER
- intent_sequence TEXT (JSON array of intents in order)
- dominant_intent TEXT
- dominant_domain TEXT
- unique_tools TEXT (JSON array)
- languages_used TEXT (JSON array)
- outcome TEXT ("completed", "abandoned", "error_exit")
- project_type TEXT
- mcp_servers_used TEXT (JSON array)
- satisfaction_score INTEGER (0-100, behavioral signal)
- satisfaction_signals TEXT (JSON object)
- subject TEXT (AI-generated session summary)
- permission_mode TEXT (permission mode at session start)
- edit_count INTEGER (total write tool calls)
- read_count INTEGER (total read/search tool calls)
- search_to_edit_ratio REAL (read_count / (edit_count + 1))
- error_recovery_rate REAL (0.0-1.0, ratio of failure runs followed by success)
- mcp_tool_count INTEGER (total MCP tool calls in session)
- unique_mcp_servers INTEGER (distinct MCP servers used)
- subagent_count INTEGER (number of subagents spawned)
- context_compactions INTEGER (number of context window compactions)

## Rules
- ONLY generate SELECT statements. Never INSERT, UPDATE, DELETE, DROP, or ALTER.
- Use SQLite syntax (e.g. json_each for JSON arrays).
- Limit results to 15 rows max.
- Round percentages and averages to 1 decimal place.
- Order results meaningfully (by count DESC, or by score DESC).
- IMPORTANT: Use short, clean column aliases. Use lowercase words, not snake_case.
  Good: "server", "calls", "sessions", "rate"
  Bad: "mcp_server_name", "usage_count", "success_rate_pct"
- The FIRST column should be the label/name column (text).
- The SECOND column should be the primary numeric value (count, score, etc.).
- Keep to 2-4 columns. Fewer is better.
- When asked about tools, default to showing MCP tools (interesting) not built-in tools (boring).
- For x402 queries, join with x402_events table to see payment services.
- For vibecoder behavior questions, use session aggregates (search_to_edit_ratio, error_recovery_rate, etc.)
`

interface QueryResult {
  title: string
  sql: string
  cost_cents: number
}

interface X402Receipt {
  verified: boolean
  amountUsd: string
  holdersShare: string
  settlement: string
  from: string
}

const anthropic = new Anthropic()
const db = initDb(DB_PATH)
let totalSpent = 0

const SYSTEM = `You are a data analyst for Pollen, a developer behavior intelligence platform. Users ask natural language questions about developer patterns and you generate SQL queries.\n\n${SCHEMA_CONTEXT}\n\nRespond with ONLY a JSON object (no markdown, no code fences):\n{\n  "title": "Short title (4-6 words, no period)",\n  "sql": "SELECT ...",\n  "cost_cents": 3 to 10\n}`

async function generateQuery(question: string, retryContext?: string): Promise<QueryResult> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: question },
  ]
  if (retryContext) {
    messages.push({ role: 'assistant', content: retryContext })
    messages.push({ role: 'user', content: 'That SQL failed. Fix the query — remember to check column names carefully. The sessions table uses "dominant_intent" not "intent".' })
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 512,
    system: SYSTEM,
    messages,
  })

  let text = (response.content[0] as { type: 'text'; text: string }).text.trim()
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  return JSON.parse(text)
}

// ── x402 Payment ────────────────────────────────────────

async function signAndVerifyPayment(costCents: number): Promise<X402Receipt | null> {
  if (!account || !demoKey || !POLLEN_SETTLEMENT) return null

  try {
    const costUnits = BigInt(costCents) * 10000n // cents → USDC units (6 decimals)

    // Shared EIP-3009 signing helper (see x402.ts)
    const { header: paymentHeader } = await signX402Payment(demoKey as `0x${string}`, {
      payTo: POLLEN_SETTLEMENT,
      amountUnits: costUnits,
      network: 'base-mainnet',
      asset: USDC_BASE,
      validSeconds: 60,
    })

    const response = await fetch(`${POLLEN_API}/pollen/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': paymentHeader,
      },
      body: JSON.stringify({ query: 'pollen-data' }),
    })

    if (!response.ok) {
      return null
    }

    const receipt = await response.json() as any
    return {
      verified: true,
      amountUsd: receipt.payment.amountUsd,
      holdersShare: receipt.payment.holdersShare,
      settlement: receipt.payment.settlement ?? 'unknown',
      from: receipt.payment.from,
    }
  } catch {
    return null
  }
}

// ── Display ─────────────────────────────────────────────

function bar(ratio: number, width = 16): string {
  const filled = Math.round(ratio * width)
  return '▓'.repeat(filled) + '░'.repeat(width - filled)
}

function printReceipt(costCents: number, rows: number, x402?: X402Receipt | null) {
  totalSpent += costCents
  if (x402?.verified) {
    // Real x402 receipt — server-verified EIP-712 signature
    console.log(`  ${G}✓${R} ${D}${x402.amountUsd} USDC ${G}verified${R}${D} via x402${R}  ${D}│${R}  ${G}${x402.holdersShare} → POLLEN holders${R}  ${D}│${R}  ${D}${rows} rows  ·  settlement: ${x402.settlement}${R}`)
  } else {
    // Simulated receipt (no demo key)
    const cost = `$${(costCents / 100).toFixed(2)}`
    const toHolders = `$${(costCents / 100).toFixed(3)}`
    console.log(`  ${G}✓${R} ${D}${cost} USDC via x402${R}  ${D}│${R}  ${G}${toHolders} → POLLEN holders${R}  ${D}│${R}  ${D}${rows} rows${R}`)
  }
}

function renderResults(rows: Record<string, unknown>[], title: string) {
  if (rows.length === 0) {
    console.log(`  ${D}No data found.${R}`)
    console.log('')
    return
  }

  const cols = Object.keys(rows[0])

  // Find the primary numeric column (for bars) — second column if numeric
  let barCol: string | null = null
  let maxBarVal = 0
  for (const col of cols.slice(1)) {
    if (typeof rows[0][col] === 'number') {
      barCol = col
      maxBarVal = Math.max(...rows.map(r => Number(r[col]) || 0))
      break
    }
  }

  // Compute column widths from actual data
  const widths: Record<string, number> = {}
  for (const col of cols) {
    widths[col] = col.length
    for (const row of rows) {
      const val = row[col]
      const len = val != null ? String(val).length : 1
      widths[col] = Math.max(widths[col], len)
    }
  }

  // Print title
  console.log('')
  console.log(`  ${B}${title}${R}`)
  console.log(`  ${D}${'─'.repeat(Math.min(52, title.length + 4))}${R}`)

  // Print rows — first col left-aligned, rest right-aligned, bar after primary numeric
  for (const row of rows) {
    let line = '  '
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]
      const val = row[col]
      const str = val != null ? String(val) : '—'
      const w = widths[col]

      if (i === 0) {
        // Label column — left aligned, copper colored
        line += `${C}${str.padEnd(w)}${R}`
      } else if (typeof val === 'number') {
        line += `  ${W}${str.padStart(w)}${R}`
      } else {
        line += `  ${str.padEnd(w)}`
      }

      // Add bar right after the primary numeric column
      if (col === barCol && maxBarVal > 0) {
        const ratio = (Number(val) || 0) / maxBarVal
        line += `  ${CY}${bar(ratio)}${R}`
      }
    }
    console.log(line)
  }
  console.log('')
}

// ── Banner ──────────────────────────────────────────────
console.log('')
console.log(`  ${C}${B}Pollen Query API${R}  ${D}x402 micropayments on Base L2${R}`)
if (x402Enabled) {
  console.log(`  ${D}100% of revenue → POLLEN holders  ·  x402: ${G}live${R}${D}  ·  ${account!.address.slice(0, 6)}…${account!.address.slice(-4)}${R}`)
} else {
  console.log(`  ${D}100% of revenue → POLLEN holders  ·  x402: ${Y}simulated${R}${D}  (set POLLEN_DEMO_KEY for real payments)${R}`)
}
console.log('')
console.log(`  ${D}Try:${R} ${CY}Which MCP tools are most popular?${R}`)
console.log(`       ${CY}What's the average search-to-edit ratio by domain?${R}`)
console.log(`       ${CY}What percentage of sessions use subagents?${R}`)
console.log(`       ${CY}What's the error recovery rate for debugging vs feature_build?${R}`)
console.log(`       ${CY}How many sessions hit context compaction?${R}`)
console.log('')

const rl = createInterface({ input: process.stdin, output: process.stdout })

let closed = false
rl.on('close', () => { closed = true })

function prompt() {
  if (closed) return
  rl.question(`${C}query>${R} `, async (input) => {
    if (closed) return
    if (!input.trim() || input.trim() === 'q' || input.trim() === 'quit') {
      if (totalSpent > 0) {
        console.log(`\n  ${D}Session: $${(totalSpent / 100).toFixed(2)} USDC  ·  100% to POLLEN holders${R}`)
      }
      console.log(`  ${D}Done.${R}\n`)
      rl.close()
      db.close()
      return
    }

    try {
      process.stdout.write(`\n  ${D}Querying...${R}`)

      let result = await generateQuery(input)

      // Safety check
      const sqlUpper = result.sql.trim().toUpperCase()
      if (!sqlUpper.startsWith('SELECT') && !sqlUpper.startsWith('WITH')) {
        process.stdout.write(`\r${''.padEnd(30)}\r`)
        console.log(`  ${Y}Rejected: only SELECT queries allowed.${R}\n`)
        prompt()
        return
      }

      let rows: Record<string, unknown>[]
      try {
        rows = db.prepare(result.sql).all() as Record<string, unknown>[]
      } catch (sqlErr: any) {
        // Retry once — send the error back to Sonnet to fix
        const failedJson = JSON.stringify(result)
        result = await generateQuery(input, failedJson)
        rows = db.prepare(result.sql).all() as Record<string, unknown>[]
      }

      // Sign and verify x402 payment (non-blocking — query already executed)
      const x402Receipt = await signAndVerifyPayment(result.cost_cents)

      process.stdout.write(`\r${''.padEnd(30)}\r`)
      printReceipt(result.cost_cents, rows.length, x402Receipt)
      renderResults(rows, result.title)

    } catch (err: any) {
      process.stdout.write(`\r${''.padEnd(30)}\r`)
      if (err.message?.includes('SQLITE') || err.message?.includes('no such column')) {
        console.log(`  ${Y}SQL error — try rephrasing.${R}\n`)
      } else {
        console.log(`  ${Y}${err.message}${R}\n`)
      }
    }

    prompt()
  })
}

prompt()
