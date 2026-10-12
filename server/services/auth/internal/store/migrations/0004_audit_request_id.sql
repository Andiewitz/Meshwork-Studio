-- Traceability: join audit rows to request logs via the shared request ID.
-- Additive nullable column; old rows simply have NULL.
ALTER TABLE IF EXISTS audit_events
  ADD COLUMN IF NOT EXISTS request_id varchar(64);
