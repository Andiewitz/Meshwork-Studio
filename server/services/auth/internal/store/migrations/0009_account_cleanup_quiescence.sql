ALTER TABLE account_cleanup_operations
    ADD COLUMN IF NOT EXISTS quiescent_since timestamptz;
