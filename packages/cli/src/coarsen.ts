import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolCategory, ErrorCategory, CommandCategory, ResponseMeta, ResponseLengthBucket, ResponseType } from './types.js'

const TOOL_CATEGORIES: Record<string, ToolCategory> = {
  Read: 'read',
  Glob: 'search',
  Grep: 'search',
  Edit: 'write',
  Write: 'write',
  NotebookEdit: 'write',
  Bash: 'execute',
  Task: 'execute',
  WebFetch: 'web',
  WebSearch: 'web',
  AskUserQuestion: 'interact',
  EnterPlanMode: 'interact',
  ExitPlanMode: 'interact',
  ToolSearch: 'search',
  Skill: 'interact',
}

export function classifyToolCategory(toolName: string): ToolCategory {
  // Direct match
  if (toolName in TOOL_CATEGORIES) return TOOL_CATEGORIES[toolName]

  // MCP tools: mcp__server__tool_name
  if (toolName.startsWith('mcp__')) return 'interact'

  return 'unknown'
}

export function extractFileExtension(toolInput: Record<string, unknown> | undefined): string | null {
  if (!toolInput) return null

  // Check file_path (Read, Write, Edit)
  const filePath = toolInput.file_path ?? toolInput.path ?? toolInput.notebook_path
  if (typeof filePath === 'string') {
    const match = filePath.match(/(\.[a-zA-Z0-9]+)$/)
    return match ? match[1] : null
  }

  // Check glob pattern for extension hint
  const pattern = toolInput.pattern
  if (typeof pattern === 'string') {
    const match = pattern.match(/\*(\.[a-zA-Z0-9]+)/)
    return match ? match[1] : null
  }

  return null
}

const COMMAND_PATTERNS: Array<[RegExp, CommandCategory]> = [
  [/^(npm\s+test|npx\s+(jest|vitest|mocha)|pytest|go\s+test|pnpm\s+test|yarn\s+test|vitest)/, 'test'],
  [/^(npm\s+run\s+build|npx\s+tsc|go\s+build|make\s+build|pnpm\s+build|cargo\s+build|tsc)/, 'build'],
  [/^(npm\s+run\s+lint|npx\s+eslint|pylint|flake8|pnpm\s+lint|biome|prettier)/, 'lint'],
  [/^git\s/, 'git'],
  [/^(npm\s+run\s+deploy|vercel|wrangler|docker|kubectl|fly\s+deploy|railway)/, 'deploy'],
  [/^(npm\s+install|pip\s+install|pnpm\s+(add|install)|yarn\s+add|cargo\s+add|brew\s+install)/, 'install'],
  [/^(npm\s+run\s+(dev|start)|node\s|python\s|tsx\s|npx\s+ts-node)/, 'run'],
  // v3: expanded command classification
  [/^(sqlite3|psql|mysql|mongosh|redis-cli)/, 'db'],
  [/^(curl|wget|httpie|http\s)/, 'http'],
  [/^(cat|head|tail|less|more|bat)\s/, 'read'],
  [/^(mkdir|rm|cp|mv|ln|touch)\s/, 'fs'],
  [/^(echo|printf)\s/, 'output'],
  [/^(ssh|scp|rsync|sftp)\s/, 'remote'],
  [/^(chmod|chown|chgrp)\s/, 'permissions'],
  [/^(ls|find|du|df|wc|stat)\s/, 'fs'],
]

export function classifyCommand(toolInput: Record<string, unknown> | undefined): CommandCategory | null {
  if (!toolInput) return null

  const command = toolInput.command
  if (typeof command !== 'string') return null

  const trimmed = command.trim()
  for (const [pattern, category] of COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) return category
  }

  return 'other'
}

const ERROR_PATTERNS: Array<[RegExp, ErrorCategory]> = [
  [/SyntaxError|ParseError|unexpected token|parsing error/i, 'syntax'],
  [/EACCES|EPERM|permission denied|not permitted|access denied/i, 'permission'],
  [/ENOENT|no such file|not found|cannot find|does not exist/i, 'not_found'],
  [/ETIMEDOUT|timeout|timed out|deadline exceeded/i, 'timeout'],
  [/test(s)?\s+(failed|failing)|FAIL\s|assertion(s)?\s+failed|expect.*received/i, 'test_failure'],
  [/build\s+failed|compilation\s+error|compile\s+error|tsc.*error/i, 'build_failure'],
  [/TypeError|ReferenceError|RangeError|Error:|runtime error|segfault|panic/i, 'runtime'],
]

export function classifyError(errorText: string | undefined): ErrorCategory {
  if (!errorText) return 'unknown'

  for (const [pattern, category] of ERROR_PATTERNS) {
    if (pattern.test(errorText)) return category
  }

  return 'unknown'
}

// --- Topic Extraction ---
// Extracts WHAT the user is trying to do (action) and WHAT they're working on (topic)
// from prompt text. Privacy-preserving: only stores normalized category labels.

const ACTION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(fix|debug|troubleshoot|solve|resolve)\b/i, 'fix'],
  [/\b(update|change|modify|edit|adjust|tweak)\b/i, 'update'],
  [/\b(deploy|ship|release|publish|launch)\b/i, 'deploy'],
  [/\b(remove|delete|drop|clean|strip|prune)\b/i, 'remove'],
  [/\b(refactor|restructure|reorganize|simplify|extract|split|dedup)\b/i, 'refactor'],
  [/\b(add|create|build|implement|make|write|generate|scaffold|new)\b/i, 'create'],
  [/\b(test|verify|validate|check|assert|ensure|confirm)\b/i, 'test'],
  [/\b(explain|describe|show|tell|walk me|help me understand)\b/i, 'understand'],
  [/\b(configure|setup|set\s*up|install|initialize|init|bootstrap)\b/i, 'setup'],
  [/\b(migrate|upgrade|convert|port|move|transition)\b/i, 'migrate'],
  [/\b(optimize|improve|speed|perf|cache|faster)\b/i, 'optimize'],
  [/\b(review|audit|inspect|analyze|evaluate|look at)\b/i, 'review'],
  [/\b(integrate|connect|hook|wire|link|plug)\b/i, 'integrate'],
  [/\b(design|prototype|mock|wireframe|layout)\b/i, 'design'],
  [/\b(monitor|observe|alert|trace|instrument)\b/i, 'monitor'],
]

// Match action from the beginning of the prompt (strongest signal)
// then fall back to anywhere in the text
export function extractAction(text: string): string | null {
  if (!text) return null

  // Strip code blocks to avoid matching inside pasted code
  const cleaned = text.replace(/```[\s\S]*?```/g, '').trim()
  if (!cleaned) return null

  // First: check the beginning of the prompt (imperative verbs)
  for (const [pattern, action] of ACTION_PATTERNS) {
    // Test against just the first ~60 chars for a strong positional signal
    const start = cleaned.slice(0, 60)
    if (pattern.test(start)) return action
  }

  // Fallback: check anywhere in text
  for (const [pattern, action] of ACTION_PATTERNS) {
    if (pattern.test(cleaned)) return action
  }

  // Questions are "understand" actions
  if (/^(how|what|why|when|where|which|can|does|is|should|could|would)\b/i.test(cleaned)) {
    return 'understand'
  }

  return null
}

const TOPIC_PATTERNS: Array<[RegExp, string]> = [
  // Auth & Identity
  [/\b(auth|login|logout|session|jwt|oauth|token|password|credential|signup|sign.?up|sign.?in|permission|role|rbac)\b/i, 'auth'],
  // Database
  [/\b(database|(?<![a-z])db(?![a-z])|sql|postgres|mysql|sqlite|mongo|redis|migration|schema|table|query|orm|prisma|drizzle|knex|neon|d1)\b/i, 'database'],
  // API
  [/\b(api|endpoint|route|rest|graphql|grpc|webhook|middleware|handler|controller)\b/i, 'api'],
  // Testing
  [/\b(test|spec|assertion|coverage|mock|stub|fixture|vitest|jest|playwright|cypress|e2e)\b/i, 'testing'],
  // Web3 / Crypto (before infra so "smart contract" doesn't get caught by "deploy")
  [/\b(crypto|wallet|blockchain|contract|token|nft|web3|ethers|viem|solidity|evm|chain(?!ed)|transaction|onchain|mint)\b/i, 'web3'],
  // Infrastructure / Deploy
  [/\b(deploy|ci\/cd|pipeline|docker|k8s|kubernetes|terraform|cloudflare|vercel|aws|gcp|azure|worker|serverless|lambda|wrangler)\b/i, 'infra'],
  // UI / Frontend
  [/\b(ui|component|css|style|layout|responsive|tailwind|button|form|modal|page|navigation|sidebar|header|footer|react|vue|svelte)\b/i, 'ui'],
  // Types / Schema
  [/\b(type|interface|schema|validation|zod|generic|enum|typing)\b/i, 'types'],
  // Config
  [/\b(config|env|settings|dotenv|environment|variable|secret|wrangler\.toml|package\.json|tsconfig)\b/i, 'config'],
  // Errors / Debugging
  [/\b(error|bug|crash|exception|stack.?trace|debug|breakpoint|log|console\.)\b/i, 'errors'],
  // Performance
  [/\b(performance|optimize|cache|speed|slow|fast|memory|leak|profil|bundle.?size|lazy)\b/i, 'performance'],
  // Security
  [/\b(security|vulnerab|xss|injection|sanitiz|encrypt|hash|cors|csrf|rate.?limit)\b/i, 'security'],
  // Documentation
  [/\b(doc|readme|documentation|comment|jsdoc|changelog|guide)\b/i, 'docs'],
  // Git / Version Control
  [/\b(git|branch|merge|pr|pull.?request|commit|rebase|conflict|stash)\b/i, 'git'],
  // Dependencies
  [/\b(package|dependency|npm|pnpm|yarn|upgrade|version|lockfile)\b/i, 'deps'],
  // Networking
  [/\b(http|fetch|request|websocket|socket|proxy|ssl|tls|dns|url|cors)\b/i, 'network'],
  // State Management
  [/\b(state|store|redux|zustand|context|provider|reducer|signal)\b/i, 'state'],
  // Build / Compile
  [/\b(build|compile|bundle|webpack|vite|esbuild|turbo|rollup|transpil)\b/i, 'build'],
  // AI / LLM
  [/\b(ai|llm|model|prompt|agent|embedding|vector|rag|anthropic|openai|claude|gpt|mcp)\b/i, 'ai'],
  // Data / Analytics
  [/\b(data|csv|json|parse|transform|aggregate|analytics|chart|graph|visualization|dune)\b/i, 'data'],
  // CLI / Tooling
  [/\b(cli|command|terminal|shell|script|bash|zsh|tool|binary|executable)\b/i, 'cli'],
  // Payments / Billing
  [/\b(payment|stripe|billing|invoice|subscription|checkout|pricing)\b/i, 'payments'],
  // Email
  [/\b(email|smtp|sendgrid|resend|mailgun|newsletter|inbox)\b/i, 'email'],
  // Scheduling
  [/\b(calendar|schedule|cron|recurring|booking|appointment)\b/i, 'scheduling'],
  // Mobile
  [/\b(mobile|ios|android|react.?native|flutter|swift|kotlin|expo)\b/i, 'mobile'],
  // Design
  [/\b(design|figma|icon|image|asset|svg|font|color|theme|dark.?mode)\b/i, 'design'],
]

export function extractTopic(text: string): string | null {
  if (!text) return null

  // Strip code blocks
  const cleaned = text.replace(/```[\s\S]*?```/g, '').trim()
  if (!cleaned) return null

  for (const [pattern, topic] of TOPIC_PATTERNS) {
    if (pattern.test(cleaned)) return topic
  }

  return null
}

// Extract MCP server name from tool name: mcp__<server>__<tool> → server
// Server names may themselves contain underscores (mcp__ccd_session__spawn_task),
// so split on the "__" separator instead of matching [^_]+.
export function extractMcpServer(toolName: string): string | null {
  if (!toolName.startsWith('mcp__')) return null
  const server = toolName.slice(5).split('__')[0]
  return server.length > 0 ? server : null
}

// Detect project type from cwd by checking for marker files
const PROJECT_MARKERS: Array<[string, string]> = [
  ['package.json', 'node'],
  ['Cargo.toml', 'rust'],
  ['pyproject.toml', 'python'],
  ['setup.py', 'python'],
  ['requirements.txt', 'python'],
  ['go.mod', 'go'],
  ['Gemfile', 'ruby'],
  ['build.gradle', 'java'],
  ['pom.xml', 'java'],
  ['*.csproj', 'dotnet'],
  ['mix.exs', 'elixir'],
  ['pubspec.yaml', 'dart'],
  ['CMakeLists.txt', 'cpp'],
  ['Makefile', 'make'],
  ['flake.nix', 'nix'],
  ['deno.json', 'deno'],
  ['bun.lockb', 'bun'],
]

export function detectProjectType(cwd: string | undefined): string | null {
  if (!cwd) return null

  try {
    for (const [marker, projectType] of PROJECT_MARKERS) {
      if (marker.startsWith('*')) continue // skip glob patterns
      if (existsSync(join(cwd, marker))) return projectType
    }
  } catch {
    // cwd might not exist or be accessible
  }

  return null
}

// Extract response metadata from Stop event's last_assistant_message
export function extractResponseMeta(message: string | undefined): ResponseMeta | null {
  if (!message) return null

  const charCount = message.length

  let lengthBucket: ResponseLengthBucket
  if (charCount < 200) lengthBucket = 'short'
  else if (charCount < 1000) lengthBucket = 'medium'
  else if (charCount < 5000) lengthBucket = 'long'
  else lengthBucket = 'very_long'

  // Count code blocks (``` delimiters)
  const codeBlockMatches = message.match(/```/g)
  const codeBlockCount = codeBlockMatches ? Math.floor(codeBlockMatches.length / 2) : 0

  // Check for error mentions
  const hasErrorMention = /error|fail|exception|bug|crash|broken/i.test(message)

  return {
    char_count: charCount,
    length_bucket: lengthBucket,
    code_block_count: codeBlockCount,
    has_error_mention: hasErrorMention,
  }
}

// --- v4: Tool Response Coarsening ---

// Infer response type from tool name when no response body is available
const TOOL_RESPONSE_MAP: Record<string, ResponseType> = {
  Read: 'file_content',
  Glob: 'search_results',
  Grep: 'search_results',
  Edit: 'code_generated',
  Write: 'code_generated',
  NotebookEdit: 'code_generated',
  Bash: 'command_output',
  WebFetch: 'web_content',
  WebSearch: 'web_content',
  AskUserQuestion: 'confirmation',
  EnterPlanMode: 'confirmation',
  ExitPlanMode: 'confirmation',
  ToolSearch: 'search_results',
}

export function inferResponseType(toolName: string): ResponseType {
  if (toolName in TOOL_RESPONSE_MAP) return TOOL_RESPONSE_MAP[toolName]
  if (toolName.startsWith('mcp__')) return 'unknown'
  return 'unknown'
}

export interface CoarsenedResponse {
  response_type: ResponseType
  response_size: number
  file_paths_mentioned: number
  has_code_blocks: boolean
  has_error: boolean
  line_count: number
  truncated_summary: string
}

/** Classify a tool response body into coarsened metadata */
export function classifyToolResponse(toolName: string, responseText: string): CoarsenedResponse {
  if (!responseText || responseText.length === 0) {
    return {
      response_type: 'empty',
      response_size: 0,
      file_paths_mentioned: 0,
      has_code_blocks: false,
      has_error: false,
      line_count: 0,
      truncated_summary: '',
    }
  }

  // Determine base response type from tool name
  let responseType = inferResponseType(toolName)

  // Override with content-based detection
  const hasError = /error|Error|ENOENT|EACCES|fail|exception|panic/i.test(responseText)
  if (hasError && responseText.length < 500) {
    responseType = 'error_output'
  }

  // Short successful output → confirmation
  if (responseText.length < 100 && /success|done|ok|created|updated|✓|✔/i.test(responseText)) {
    responseType = 'confirmation'
  }

  // Count file paths (lines starting with / or containing common extensions)
  const filePathMatches = responseText.match(/(?:^|\s)(\/[\w/.-]+\.\w+)/gm)
  const filePaths = filePathMatches ? filePathMatches.length : 0

  // Count code blocks
  const codeBlockMatches = responseText.match(/```/g)
  const hasCodeBlocks = codeBlockMatches ? codeBlockMatches.length >= 2 : false

  const lines = responseText.split('\n').length

  // Truncate for summary — strip potential PII (emails, paths with usernames)
  let summary = responseText.slice(0, 200)
  summary = summary.replace(/\/Users\/\w+/g, '/Users/***')
  summary = summary.replace(/[\w.-]+@[\w.-]+/g, '***@***')

  return {
    response_type: responseType,
    response_size: responseText.length,
    file_paths_mentioned: filePaths,
    has_code_blocks: hasCodeBlocks,
    has_error: hasError,
    line_count: lines,
    truncated_summary: summary,
  }
}
