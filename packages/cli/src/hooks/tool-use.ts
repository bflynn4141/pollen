import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { classifyToolCategory, extractFileExtension, classifyCommand, extractMcpServer } from '../coarsen.js'
import { insertToolEvent, getToolEventCount } from '../store.js'
import type { HookInput } from '../types.js'

export function handlePostToolUse(db: Database.Database, input: HookInput): void {
  const toolName = input.tool_name
  if (!toolName || !input.session_id) return

  const sequenceNumber = getToolEventCount(db, input.session_id)

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
    mcp_server: extractMcpServer(toolName),
    duration_ms: null,
  })
}
