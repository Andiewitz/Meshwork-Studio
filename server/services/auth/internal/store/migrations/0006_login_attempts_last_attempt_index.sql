CREATE INDEX IF NOT EXISTS login_attempts_last_attempt_idx
  ON login_attempts (last_attempt);
