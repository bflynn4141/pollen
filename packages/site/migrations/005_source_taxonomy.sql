-- 005: source taxonomy split.
-- `source` = agent CLI identity ('claude-code' | 'codex').
-- `start_source` = the session-start trigger from the hook payload
-- ('startup' | 'clear' | 'resume' | 'compact'), previously misfiled in source.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS start_source TEXT;

-- Repair rows written before the split. Every non-codex row is Claude Code.
UPDATE sessions SET start_source = source
WHERE source IN ('startup', 'clear', 'resume', 'compact') AND start_source IS NULL;

UPDATE sessions SET source = 'claude-code'
WHERE source IS NULL OR source NOT IN ('claude-code', 'codex');
