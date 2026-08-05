import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { classifyToolCategory, extractFileExtension, classifyCommand, classifyError, extractMcpServer, extractEffortLevel } from '../coarsen.js'
import { getOrCreateContributorId } from '../config.js'
import { insertToolEvent, getToolEventCount, insertX402Event } from '../store.js'
import type { HookInput } from '../types.js'

// MCP servers that handle x402 payments
const X402_SERVERS = new Set(['x402', 'x402-agent', 'x402-tokenization', 'signal402'])

export function handlePostToolUseFailure(db: Database.Database, input: HookInput): void {
  const toolName = input.tool_name
  if (!toolName || !input.session_id) return

  const sequenceNumber = getToolEventCount(db, input.session_id)
  // Fix: Claude Code sends 'error', not 'tool_error'
  const errorText = input.error ?? input.tool_error
  const mcpServer = extractMcpServer(toolName)
  const contributorId = getOrCreateContributorId()

  insertToolEvent(db, {
    id: randomUUID(),
    session_id: input.session_id,
    timestamp: Date.now(),
    tool_name: toolName,
    tool_category: classifyToolCategory(toolName),
    success: false,
    error_category: classifyError(errorText),
    file_extension: extractFileExtension(input.tool_input),
    command_category: toolName === 'Bash' ? classifyCommand(input.tool_input) : null,
    sequence_number: sequenceNumber,
    mcp_server: mcpServer,
    duration_ms: null,
    contributor_id: contributorId,
    response_type: 'error_output',
    response_has_error: true,
    response_summary: errorText ? errorText.slice(0, 200) : null,
    tool_use_id: input.tool_use_id ?? null,
    agent_id: input.agent_id ?? null,
    agent_type: input.agent_type ?? null,
    effort_level: extractEffortLevel(input.effort),
  })

  // x402 failure tracking
  if (mcpServer && X402_SERVERS.has(mcpServer)) {
    insertX402Event(db, {
      id: randomUUID(),
      session_id: input.session_id,
      timestamp: Date.now(),
      tool_name: toolName,
      mcp_server: mcpServer,
      service_url: null,
      service_name: null,
      success: false,
      contributor_id: contributorId,
    })
  }
}
