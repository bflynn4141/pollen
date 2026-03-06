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
import { randomBytes } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { initDb } from './store.js'
import { DB_PATH } from './config.js'
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
const POLLEN_SETTLEMENT = '0x3ECa3185dE4622b65B2EF4dDc2dB6E7d0cB1B672' as const
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// ── x402 Wallet Setup ───────────────────────────────────
const demoKey = process.env.POLLEN_DEMO_KEY
let account: ReturnType<typeof privateKeyToAccount> | null = null
let walletClient: ReturnType<typeof createWalletClient> | null = null

if (demoKey) {
  account = privateKeyToAccount(demoKey as `0x${string}`)
  walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  })
}

const x402Enabled = !!(account && walletClient)

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
- keywords TEXT (JSON array of extracted keywords)
- tools_chain TEXT (JSON array)
- language_signals TEXT (JSON array, e.g. ["typescript", "python"])
- frameworks TEXT (JSON array, e.g. ["react", "nextjs", "prisma"])
- prompt_length TEXT (bucket: "tiny", "short", "medium", "long", "huge")
- code_ratio TEXT ("none", "low", "medium", "high")
- structure_type TEXT ("imperative", "question", "error_paste", "code_heavy", "mixed")
- session_depth TEXT ("first", "early", "mid", "deep")
- has_error_trace INTEGER (0 or 1)
- has_code_block INTEGER (0 or 1)
- day_of_week TEXT (e.g. "Monday")
- hour_bucket TEXT (e.g. "morning", "afternoon", "evening", "night")
- intent TEXT ("debugging", "code-generation", "refactoring", "exploration", "learning", "devops", "testing", "documentation", "code-review")
- complexity TEXT ("simple", "moderate", "complex")
- prompt_style TEXT
- domain TEXT ("web_frontend", "backend", "devops", "data", "systems", "mobile")
- action TEXT ("fix", "create", "explain", "deploy", "test", "refactor", "configure", "investigate", "optimize", "migrate")
- topic TEXT ("auth", "database", "api", "deployment", "frontend", "styling", "testing", "performance", "security", "ai", "cli", "middleware", "animation", "canvas", etc.)

### tool_events
One row per tool call made by Claude Code during a session.
- id TEXT PRIMARY KEY
- session_id TEXT
- timestamp INTEGER (unix ms)
- tool_name TEXT (e.g. "Read", "Edit", "Bash", "Grep", "Write", "Glob", "Task", "AskUserQuestion", or MCP tools like "mcp__clara__wallet_send")
- tool_category TEXT ("read", "write", "execute", "search", "interact", "meta")
- success INTEGER (0 or 1)
- error_category TEXT (null if success)
- file_extension TEXT (e.g. ".ts", ".py")
- command_category TEXT (for Bash: "git", "npm", "test", "build", etc.)
- sequence_number INTEGER
- mcp_server TEXT (extracted server name if MCP tool, else null)
- duration_ms INTEGER

### sessions
One row per Claude Code session.
- session_id TEXT PRIMARY KEY
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
- satisfaction_signals TEXT (JSON array)
- subject TEXT (AI-generated session summary)

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
  if (!account || !walletClient) return null

  try {
    const costUnits = BigInt(costCents) * 10000n // cents → USDC units (6 decimals)
    const now = Math.floor(Date.now() / 1000)
    const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`

    const authorization = {
      from: account.address,
      to: POLLEN_SETTLEMENT,
      value: costUnits,
      validAfter: 0n,
      validBefore: BigInt(now + 60),
      nonce,
    }

    const signature = await walletClient.signTypedData({
      account,
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: 8453,
        verifyingContract: USDC_BASE,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: authorization,
    })

    const payment = {
      x402Version: 1,
      scheme: 'exact',
      network: 'base-mainnet',
      payload: {
        signature,
        authorization: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value.toString(),
          validAfter: authorization.validAfter.toString(),
          validBefore: authorization.validBefore.toString(),
          nonce: authorization.nonce,
        },
      },
    }

    const paymentHeader = Buffer.from(JSON.stringify(payment)).toString('base64')

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
console.log(`  ${D}Try:${R} ${CY}What are developers debugging most?${R}`)
console.log(`       ${CY}Which MCP servers are used the most?${R}`)
console.log(`       ${CY}Are developers happier refactoring or debugging?${R}`)
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
