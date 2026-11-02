ALTER TABLE account_cleanup_operations
    ADD COLUMN IF NOT EXISTS claim_token uuid,
    ADD COLUMN IF NOT EXISTS locked_until timestamptz,
    ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_error text;
CREATE INDEX IF NOT EXISTS account_cleanup_pending_idx
    ON account_cleanup_operations (next_attempt_at, created_at)
    WHERE status = 'pending';
