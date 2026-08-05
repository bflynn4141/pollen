import type Database from 'better-sqlite3'

interface ColumnInfo {
  name: string
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table) as { name: string } | undefined
  return !!row
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  if (!tableExists(db, table)) return true // skip migration for non-existent tables (schema will create them)
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]
  return cols.some(c => c.name === column)
}

export function migrateSchema(db: Database.Database): void {
  // tool_events: add mcp_server column
  if (!hasColumn(db, 'tool_events', 'mcp_server')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN mcp_server TEXT').run()
  }

  // tool_events: add duration_ms column
  if (!hasColumn(db, 'tool_events', 'duration_ms')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN duration_ms INTEGER').run()
  }

  // sessions: add project_type column
  if (!hasColumn(db, 'sessions', 'project_type')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN project_type TEXT').run()
  }

  // sessions: add end_reason column
  if (!hasColumn(db, 'sessions', 'end_reason')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN end_reason TEXT').run()
  }

  // sessions: add mcp_servers_used column
  if (!hasColumn(db, 'sessions', 'mcp_servers_used')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN mcp_servers_used TEXT').run()
  }

  // sessions: add response_count column
  if (!hasColumn(db, 'sessions', 'response_count')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN response_count INTEGER NOT NULL DEFAULT 0').run()
  }

  // sessions: add avg_response_length column
  if (!hasColumn(db, 'sessions', 'avg_response_length')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN avg_response_length INTEGER NOT NULL DEFAULT 0').run()
  }

  // contributions: add action column (topic extraction)
  if (!hasColumn(db, 'contributions', 'action')) {
    db.prepare('ALTER TABLE contributions ADD COLUMN action TEXT').run()
  }

  // contributions: add topic column (topic extraction)
  if (!hasColumn(db, 'contributions', 'topic')) {
    db.prepare('ALTER TABLE contributions ADD COLUMN topic TEXT').run()
  }

  // sessions: add satisfaction_score column
  if (!hasColumn(db, 'sessions', 'satisfaction_score')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN satisfaction_score INTEGER').run()
  }

  // sessions: add satisfaction_signals column
  if (!hasColumn(db, 'sessions', 'satisfaction_signals')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN satisfaction_signals TEXT').run()
  }

  // sessions: add subject column (LLM-extracted session subject)
  if (!hasColumn(db, 'sessions', 'subject')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN subject TEXT').run()
  }

  // --- v4: contributor_id across all tables ---
  if (!hasColumn(db, 'sessions', 'contributor_id')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN contributor_id TEXT').run()
  }
  if (!hasColumn(db, 'contributions', 'contributor_id')) {
    db.prepare('ALTER TABLE contributions ADD COLUMN contributor_id TEXT').run()
  }
  if (!hasColumn(db, 'tool_events', 'contributor_id')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN contributor_id TEXT').run()
  }
  if (!hasColumn(db, 'x402_events', 'contributor_id')) {
    db.prepare('ALTER TABLE x402_events ADD COLUMN contributor_id TEXT').run()
  }

  // --- v4: tool response coarsening ---
  if (!hasColumn(db, 'tool_events', 'response_type')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN response_type TEXT').run()
  }
  if (!hasColumn(db, 'tool_events', 'response_size')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN response_size INTEGER').run()
  }
  if (!hasColumn(db, 'tool_events', 'response_file_paths')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN response_file_paths INTEGER').run()
  }
  if (!hasColumn(db, 'tool_events', 'response_has_code')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN response_has_code INTEGER').run()
  }
  if (!hasColumn(db, 'tool_events', 'response_has_error')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN response_has_error INTEGER').run()
  }
  if (!hasColumn(db, 'tool_events', 'response_summary')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN response_summary TEXT').run()
  }

  // --- v4: session aggregates ---
  if (!hasColumn(db, 'sessions', 'edit_count')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN edit_count INTEGER DEFAULT 0').run()
  }
  if (!hasColumn(db, 'sessions', 'read_count')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN read_count INTEGER DEFAULT 0').run()
  }
  if (!hasColumn(db, 'sessions', 'search_to_edit_ratio')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN search_to_edit_ratio REAL').run()
  }
  if (!hasColumn(db, 'sessions', 'error_recovery_rate')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN error_recovery_rate REAL').run()
  }
  if (!hasColumn(db, 'sessions', 'mcp_tool_count')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN mcp_tool_count INTEGER DEFAULT 0').run()
  }
  if (!hasColumn(db, 'sessions', 'unique_mcp_servers')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN unique_mcp_servers INTEGER DEFAULT 0').run()
  }
  if (!hasColumn(db, 'sessions', 'permission_mode')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN permission_mode TEXT').run()
  }
  if (!hasColumn(db, 'sessions', 'subagent_count')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN subagent_count INTEGER DEFAULT 0').run()
  }
  if (!hasColumn(db, 'sessions', 'context_compactions')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN context_compactions INTEGER DEFAULT 0').run()
  }

  // --- v4: permission_mode on contributions ---
  if (!hasColumn(db, 'contributions', 'permission_mode')) {
    db.prepare('ALTER TABLE contributions ADD COLUMN permission_mode TEXT').run()
  }

  // --- v5: Claude Code capture upgrades (tool_use_id, subagent attribution, effort) ---
  if (!hasColumn(db, 'tool_events', 'tool_use_id')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN tool_use_id TEXT').run()
  }
  if (!hasColumn(db, 'tool_events', 'agent_id')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN agent_id TEXT').run()
  }
  if (!hasColumn(db, 'tool_events', 'agent_type')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN agent_type TEXT').run()
  }
  if (!hasColumn(db, 'tool_events', 'effort_level')) {
    db.prepare('ALTER TABLE tool_events ADD COLUMN effort_level TEXT').run()
  }

  // --- v5: sessions capture upgrades ---
  if (!hasColumn(db, 'sessions', 'transcript_path')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN transcript_path TEXT').run()
  }
  if (!hasColumn(db, 'sessions', 'stop_tool_use_count')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN stop_tool_use_count INTEGER').run()
  }

  // --- v5: source taxonomy — source is CLI identity, start_source the trigger ---
  if (!hasColumn(db, 'sessions', 'start_source')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN start_source TEXT').run()
    // Repair rows written before the split: hook-payload trigger values were
    // stored in source; every non-codex row is Claude Code.
    db.prepare(
      "UPDATE sessions SET start_source = source WHERE source IN ('startup','clear','resume','compact')"
    ).run()
    db.prepare(
      "UPDATE sessions SET source = 'claude-code' WHERE source IS NULL OR source NOT IN ('claude-code','codex')"
    ).run()
  }

  // --- v5: Codex backfill token totals ---
  if (!hasColumn(db, 'sessions', 'input_tokens')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN input_tokens INTEGER').run()
  }
  if (!hasColumn(db, 'sessions', 'output_tokens')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN output_tokens INTEGER').run()
  }
  if (!hasColumn(db, 'sessions', 'cached_input_tokens')) {
    db.prepare('ALTER TABLE sessions ADD COLUMN cached_input_tokens INTEGER').run()
  }
}
