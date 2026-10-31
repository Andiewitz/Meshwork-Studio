-- Durable account lifecycle state. No public deletion route is enabled by this
-- migration. A fencing operation cannot dispatch cleanup until sessions and
-- previously issued assertions have been invalidated.
CREATE TABLE IF NOT EXISTS account_cleanup_operations (
    id uuid PRIMARY KEY,
    user_id varchar(128) NOT NULL UNIQUE,
    status varchar(16) NOT NULL DEFAULT 'fencing'
        CHECK (status IN ('fencing', 'pending', 'completed', 'failed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS account_cleanup_steps (
    operation_id uuid NOT NULL REFERENCES account_cleanup_operations(id),
    service varchar(16) NOT NULL CHECK (service IN ('workspace', 'ai', 'team')),
    status varchar(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'completed', 'failed')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (operation_id, service)
);
