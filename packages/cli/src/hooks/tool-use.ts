import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { classifyToolCategory, extractFileExtension, classifyCommand, extractMcpServer, inferResponseType, classifyToolResponse, extractEffortLevel } from '../coarsen.js'
import { getOrCreateContributorId } from '../config.js'
import { insertToolEvent, getToolEventCount, insertX402Event } from '../store.js'
import type { HookInput } from '../types.js'

// MCP servers that handle x402 payments
const X402_SERVERS = new Set(['x402', 'x402-agent', 'x402-tokenization', 'signal402'])

// Tool names that actually make x402 payment calls (not just discovery/metadata)
const X402_CALL_TOOLS = new Set([
  'mcp__x402__fetch',
  'mcp__x402__fetch_with_auth',
  'mcp__signal402__signal402_call',
  'mcp__signal402__signal402_probe',
  'mcp__x402-agent__x402_discover',
])

function extractX402Service(toolInput: Record<string, unknown> | undefined): { url: string | null; name: string | null } {
  if (!toolInput) return { url: null, name: null }

  // Extract service URL from common input field names
  let url: string | null = null
  for (const field of ['url', 'endpoint', 'base_url', 'service_url', 'target_url', 'api_url']) {
    const val = toolInput[field]
    if (typeof val === 'string' && val.length > 0) {
      url = val
      break
    }
  }

  // Extract service name (signal402 uses service/name fields)
  let name: string | null = null
  for (const field of ['service', 'name', 'service_name', 'provider', 'service_id']) {
    const val = toolInput[field]
    if (typeof val === 'string' && val.length > 0) {
      name = val
      break
    }
  }

  // If we have a URL but no name, extract hostname as name
  if (url && !name) {
    try {
      name = new URL(url).hostname
    } catch { /* not a valid URL */ }
  }

  return { url, name }
}

export function handlePostToolUse(db: Database.Database, input: HookInput): void {
  const toolName = input.tool_name
  if (!toolName || !input.session_id) return

  const sequenceNumber = getToolEventCount(db, input.session_id)
  const mcpServer = extractMcpServer(toolName)
  const contributorId = getOrCreateContributorId()

  // Coarsen tool response if available, otherwise infer from tool name
  // (Codex may send a structured object — stringify for classification)
  const responseText = typeof input.tool_response === 'string'
    ? input.tool_response
    : input.tool_response != null ? JSON.stringify(input.tool_response) : null
  const response = responseText
    ? classifyToolResponse(toolName, responseText)
    : null

  insertToolEvent(db, {
    id: randomUUID(),
    session_id: input.session_id,
    timestamp: Date.now(),
    tool_name: toolName,
    tool_category: classifyToolCategory(toolName),
    success: true,
    error_category: null,
    file_extension: extractFileExtension(input.tool_input),
    command_category: toolName === 'Bash' ? classifyCommand(input.tool_input) : null,
    sequence_number: sequenceNumber,
    mcp_server: mcpServer,
    duration_ms: null,
    contributor_id: contributorId,
    response_type: response?.response_type ?? inferResponseType(toolName),
    response_size: response?.response_size ?? null,
    response_file_paths: response?.file_paths_mentioned ?? null,
    response_has_code: response?.has_code_blocks ?? null,
    response_has_error: response?.has_error ?? null,
    response_summary: response?.truncated_summary ?? null,
    tool_use_id: input.tool_use_id ?? null,
    agent_id: input.agent_id ?? null,
    agent_type: input.agent_type ?? null, // verbatim — closed vocab incl. 'plugin:name'
    effort_level: extractEffortLevel(input.effort),
  })

  // x402 event tracking — detect payment-related MCP tool calls
  if (mcpServer && X402_SERVERS.has(mcpServer)) {
    const { url, name } = extractX402Service(input.tool_input)

    insertX402Event(db, {
      id: randomUUID(),
      session_id: input.session_id,
      timestamp: Date.now(),
      tool_name: toolName,
      mcp_server: mcpServer,
      service_url: url,
      service_name: name,
      success: true,
      contributor_id: contributorId,
    })
  }
}
