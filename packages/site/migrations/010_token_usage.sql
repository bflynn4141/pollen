-- Normalized token telemetry. Raw transcripts and their local paths are not
-- network data and must never be retained in the shared database.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS reasoning_tokens BIGINT;

UPDATE sessions
SET transcript_path = NULL
WHERE transcript_path IS NOT NULL;
