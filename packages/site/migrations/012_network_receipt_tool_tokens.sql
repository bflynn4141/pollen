-- Receipt v4 carries response-attributed, numeric-only token totals for each
-- coarsened tool call. Raw prompts, arguments, outputs, and paths remain
-- outside the network schema.
ALTER TABLE network_receipts
  ADD COLUMN IF NOT EXISTS tool_attributions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE network_receipts
  DROP CONSTRAINT IF EXISTS network_receipts_tool_attributions_shape;

ALTER TABLE network_receipts
  ADD CONSTRAINT network_receipts_tool_attributions_shape CHECK (
    jsonb_typeof(tool_attributions) = 'array'
    AND jsonb_array_length(tool_attributions) <= 64
  );
