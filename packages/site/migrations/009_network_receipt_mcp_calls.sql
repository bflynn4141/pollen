-- 009_network_receipt_mcp_calls.sql — receipt v2 public MCP summaries.
--
-- The JSON is a server-validated closed array of canonical public server/tool
-- identifiers, booleans, and latency buckets. It cannot contain arguments,
-- responses, URLs, image data, or arbitrary metadata. Existing v1 receipts
-- remain valid and read as an empty MCP call list.

ALTER TABLE network_receipts
  ADD COLUMN IF NOT EXISTS mcp_calls JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE network_receipts
  DROP CONSTRAINT IF EXISTS network_receipts_mcp_calls_shape;

ALTER TABLE network_receipts
  ADD CONSTRAINT network_receipts_mcp_calls_shape CHECK (
    jsonb_typeof(mcp_calls) = 'array'
    AND jsonb_array_length(mcp_calls) <= 64
  );
