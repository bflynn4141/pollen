import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { classifyToolCategory, extractFileExtension, classifyCommand, classifyError, extractMcpServer } from '../coarsen.js'
import { insertToolEvent, getToolEventCount } from '../store.js'
import type { HookInput } from '../types.js'

export function handlePostToolUseFailure(db: Database.Database, input: HookInput): void {
  const toolName = input.tool_name
  if (!toolName || !input.session_id) return

  const sequenceNumber = getToolEventCount(db, input.session_id)
  // Fix: Claude Code sends 'error', not 'tool_error'
  const errorText = input.error ?? input.tool_error

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
    mcp_server: extractMcpServer(toolName),
    duration_ms: null,
  })
}
