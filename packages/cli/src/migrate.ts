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
}
