import type { Migration } from "@server/lib/migrate";

export const MIGRATIONS: Migration[] = [
  {
    version: "0001_core",
    up: `
      CREATE TABLE IF NOT EXISTS collections (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        user_id TEXT,
        parent_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        title TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'system',
        icon TEXT DEFAULT 'box',
        is_favorite BOOLEAN DEFAULT FALSE,
        user_id TEXT,
        collection_id INTEGER REFERENCES collections(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        description TEXT,
        author TEXT,
        ai_context TEXT,
        groups JSONB DEFAULT '[]'::jsonb,
        tags JSONB DEFAULT '[]'::jsonb
      );
    `,
  },
  {
    // TRANSITIONAL: canvas tables live here until the DynamoDB cutover
    // removes the Postgres canvas implementation entirely (then dropped).
    version: "0010_canvas_transitional",
    up: `
      CREATE TABLE IF NOT EXISTS nodes (
        id VARCHAR(128) NOT NULL,
        workspace_id VARCHAR(128) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        type TEXT,
        position JSONB NOT NULL,
        data JSONB NOT NULL,
        parent_id VARCHAR(128),
        extent TEXT,
        style JSONB,
        width INTEGER,
        height INTEGER,
        measured JSONB,
        PRIMARY KEY (id, workspace_id)
      );
      CREATE INDEX IF NOT EXISTS IDX_nodes_workspace_id ON nodes (workspace_id);

      CREATE TABLE IF NOT EXISTS edges (
        id VARCHAR(128) NOT NULL,
        workspace_id VARCHAR(128) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        source VARCHAR(128) NOT NULL,
        target VARCHAR(128) NOT NULL,
        source_handle TEXT,
        target_handle TEXT,
        type TEXT,
        data JSONB,
        style JSONB,
        marker_end JSONB,
        animated INTEGER DEFAULT 0,
        PRIMARY KEY (id, workspace_id)
      );
      CREATE INDEX IF NOT EXISTS IDX_edges_workspace_id ON edges (workspace_id);
    `,
  },
  {
    version: "0020_workspace_outbox",
    up: `
      CREATE TABLE IF NOT EXISTS workspace_outbox_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type TEXT NOT NULL CHECK (event_type IN ('workspace.deleted', 'workspaces.deleted')),
        payload JSONB NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_until TIMESTAMPTZ,
        processed_at TIMESTAMPTZ,
        dead_lettered_at TIMESTAMPTZ,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS IDX_workspace_outbox_pending
        ON workspace_outbox_events (available_at, created_at)
        WHERE processed_at IS NULL AND dead_lettered_at IS NULL;
    `,
  },
];
