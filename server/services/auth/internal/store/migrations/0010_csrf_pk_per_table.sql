-- The older check matched a constraint name across the whole database. Make
-- the check specific to this table so another schema cannot hide a missing PK.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'auth_csrf_secrets'::regclass AND contype = 'p'
    ) THEN
        DELETE FROM auth_csrf_secrets a
        USING auth_csrf_secrets b
        WHERE a.session_id_hash = b.session_id_hash AND a.ctid < b.ctid;
        ALTER TABLE auth_csrf_secrets ADD PRIMARY KEY (session_id_hash);
    END IF;
END
$$;
