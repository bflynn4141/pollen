export type Intent =
  | 'debugging'
  | 'feature_build'
  | 'refactoring'
  | 'learning'
  | 'devops'
  | 'testing'
  | 'documentation'
  | 'code_review'
  | 'exploration'

export type PromptLength = 'short' | 'medium' | 'long'
export type CodeRatio = 'none' | 'low' | 'medium' | 'high'
export type StructureType = 'imperative' | 'question' | 'error_paste' | 'context_dump' | 'conversation'
export type SessionDepth = 'first' | 'early' | 'mid' | 'deep'
export type Complexity = 'simple' | 'moderate' | 'complex'
export type PromptStyle = 'directive' | 'conversational' | 'context_heavy' | 'minimal'
export type Domain = 'web_frontend' | 'web_backend' | 'devops' | 'data' | 'systems' | 'general'
export type HourBucket = 'morning' | 'afternoon' | 'evening' | 'night'

export interface RawFeatures {
  keywords: string[]
  tools_chain: string[]
  language_signals: string[]
  frameworks: string[]
  prompt_length: PromptLength
  code_ratio: CodeRatio
  structure_type: StructureType
  session_depth: SessionDepth
  has_error_trace: boolean
  has_code_block: boolean
  day_of_week: string
  hour_bucket: HourBucket
}

export interface DerivedLabels {
  intent: Intent
  sub_intent?: string
  complexity: Complexity
  prompt_style: PromptStyle
  domain: Domain
  taxonomy_version: string
  confidence: number
}

export interface Contribution {
  id: string
  timestamp: number
  session_id?: string
  features: RawFeatures
  labels: DerivedLabels
  // v3: topic extraction (stored as direct columns, not in features JSON)
  action: string | null      // "fix", "create", "explain", etc.
  topic: string | null        // "auth", "database", "api", etc.
}

// Hook event types
export type HookEventName =
  | 'UserPromptSubmit'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'

export interface HookInput {
  session_id?: string
  prompt?: string
  cwd?: string
  hook_event_name?: HookEventName
  permission_mode?: string
  transcript_path?: string
  // PostToolUse / PostToolUseFailure fields
  tool_name?: string
  tool_input?: Record<string, unknown>
  error?: string           // Claude Code sends 'error', not 'tool_error'
  tool_error?: string      // deprecated: kept for backward compat
  // Model info (SessionStart)
  model?: string
  source?: string
  // Stop event fields
  last_assistant_message?: string
  // SessionEnd fields
  reason?: string
}

// Tool usage coarsening types
export type ToolCategory = 'read' | 'write' | 'execute' | 'search' | 'web' | 'interact' | 'unknown'

export type ErrorCategory =
  | 'syntax'
  | 'runtime'
  | 'permission'
  | 'not_found'
  | 'timeout'
  | 'test_failure'
  | 'build_failure'
  | 'unknown'

export type CommandCategory =
  | 'test'
  | 'build'
  | 'lint'
  | 'git'
  | 'deploy'
  | 'install'
  | 'run'
  | 'db'
  | 'http'
  | 'fs'
  | 'output'
  | 'remote'
  | 'permissions'
  | 'read'
  | 'other'

export interface CoarsenedToolEvent {
  id: string
  session_id: string
  timestamp: number
  tool_name: string
  tool_category: ToolCategory
  success: boolean
  error_category: ErrorCategory | null
  file_extension: string | null
  command_category: CommandCategory | null
  sequence_number: number
  mcp_server: string | null
  duration_ms: number | null
}

// Session tracking types
export type DurationBucket = 'quick' | 'short' | 'medium' | 'long' | 'marathon'
export type SessionOutcome = 'completed' | 'abandoned' | 'error_exit'

export interface SessionRecord {
  session_id: string
  model: string | null
  source: string | null
  started_at: number
  ended_at: number | null
  duration_bucket: DurationBucket | null
  prompt_count: number
  tool_use_count: number
  tool_failure_count: number
  intent_sequence: string | null    // JSON array of intents observed
  dominant_intent: Intent | null
  dominant_domain: Domain | null
  unique_tools: string | null       // JSON array of tool names
  languages_used: string | null     // JSON array of languages
  outcome: SessionOutcome | null
  project_type: string | null
  end_reason: string | null
  mcp_servers_used: string | null   // JSON array of MCP server names
  response_count: number
  avg_response_length: number
  satisfaction_score: number | null
  satisfaction_signals: string | null  // JSON of signal flags
  subject: string | null               // LLM-extracted session subject (3-5 words)
}

export interface SatisfactionSignals {
  git_activity: boolean       // +15: session has git commands
  low_failure_rate: boolean   // +25: < 20% tool failures
  no_retry_storms: boolean    // +15: no tool failing 3+ times in a row
  reasonable_duration: boolean // +10: > 2 min, < 4 hours
  tool_engagement: boolean    // +15: tools were used
  consistent_intent: boolean  // +10: dominant intent > 50%
  clean_ending: boolean       // +10: not error_exit/abandoned
}

export type ResponseLengthBucket = 'short' | 'medium' | 'long' | 'very_long'

export interface ResponseMeta {
  char_count: number
  length_bucket: ResponseLengthBucket
  code_block_count: number
  has_error_mention: boolean
}

export interface IVSBreakdown {
  subject: number
  topicAction: number
  tools: number
  commands: number
  freshness: number
  depth: number
  sequenceEntropy: number
  authenticityMultiplier: number
}

export interface TermDictionary {
  error_terms: string[]
  build_terms: string[]
  refactor_terms: string[]
  learning_terms: string[]
  devops_terms: string[]
  testing_terms: string[]
  doc_terms: string[]
  review_terms: string[]
  tool_names: string[]
  languages: Record<string, string[]>
  frameworks: Record<string, string[]>
}
