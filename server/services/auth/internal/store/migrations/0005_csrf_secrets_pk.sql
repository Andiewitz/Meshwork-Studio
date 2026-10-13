-- Hardening for auth_csrf_secrets: databases provisioned before this table
-- (or its primary key) existed silently break every session-bound CSRF
-- issuance, which locks users out of ALL mutations after their 1h CSRF
-- cookie dies. Idempotent: safe to run on healthy databases (no-op there).
CREATE TABLE IF NOT EXISTS auth_csrf_secrets (
    session_id_hash varchar(128) PRIMARY KEY,
    secret_hash varchar(128) NOT NULL,
    expires_at timestamp NOT NULL
);

-- A PK-less table accumulates duplicate bindings; keep the newest per
-- session so the constraint below can be added without failing boot.
DELETE FROM auth_csrf_secrets a
USING auth_csrf_secrets b
WHERE a.session_id_hash = b.session_id_hash
  AND a.ctid < b.ctid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'auth_csrf_secrets_pkey'
    ) THEN
        ALTER TABLE auth_csrf_secrets ADD PRIMARY KEY (session_id_hash);
    END IF;
END
$$;
