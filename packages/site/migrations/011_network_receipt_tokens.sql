-- Receipt v3 adds numeric-only token aggregates. These columns contain no
-- prompts, transcript paths, tool arguments, or response content.
ALTER TABLE network_receipts
  ADD COLUMN IF NOT EXISTS input_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS output_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS cached_input_tokens BIGINT,
  ADD COLUMN IF NOT EXISTS reasoning_tokens BIGINT;

ALTER TABLE network_receipts
  DROP CONSTRAINT IF EXISTS network_receipts_token_shape;

ALTER TABLE network_receipts
  ADD CONSTRAINT network_receipts_token_shape CHECK (
    (input_tokens IS NULL OR input_tokens BETWEEN 0 AND 1000000000000)
    AND (output_tokens IS NULL OR output_tokens BETWEEN 0 AND 1000000000000)
    AND (cached_input_tokens IS NULL OR cached_input_tokens BETWEEN 0 AND input_tokens)
    AND (reasoning_tokens IS NULL OR reasoning_tokens BETWEEN 0 AND output_tokens)
  );
