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
  {
    version: "0021_durable_canvas_copy",
    up: `
      ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS canvas_copy_status TEXT NOT NULL DEFAULT 'ready'
          CHECK (canvas_copy_status IN ('ready', 'copying', 'failed'));
      ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS canvas_copy_source_id VARCHAR(128);

      ALTER TABLE workspace_outbox_events
        DROP CONSTRAINT IF EXISTS workspace_outbox_events_event_type_check;
      ALTER TABLE workspace_outbox_events
        ADD CONSTRAINT workspace_outbox_events_event_type_check
          CHECK (event_type IN ('workspace.deleted', 'workspaces.deleted', 'workspace.duplicated'));
      `,
  },
  {
    version: "0022_workspace_collaborators",
    up: `
      CREATE TABLE IF NOT EXISTS workspace_collaborators (
        workspace_id VARCHAR(128) NOT NULL
          REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id VARCHAR(128) NOT NULL,
        permission TEXT NOT NULL DEFAULT 'view'
          CHECK (permission IN ('view', 'edit')),
        added_by VARCHAR(128) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (workspace_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS IDX_workspace_collaborators_user_id
        ON workspace_collaborators (user_id);
    `,
  },
  {
    version: "0023_outbox_claim_fencing",
    up: `
      ALTER TABLE workspace_outbox_events
        ADD COLUMN IF NOT EXISTS claim_token UUID;
      ALTER TABLE workspace_outbox_events
        ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
    `,
  },
  {
    version: "0023_perf_indexes",
    up: `
      CREATE INDEX IF NOT EXISTS IDX_workspaces_user_collection_created
        ON workspaces (user_id, collection_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS IDX_workspaces_collection_id
        ON workspaces (collection_id);
      CREATE INDEX IF NOT EXISTS IDX_collections_user_parent
        ON collections (user_id, parent_id);
    `,
  },
  {
    version: "0024_workspace_access_epochs",
    up: `
      CREATE TABLE IF NOT EXISTS workspace_access_epochs (
        workspace_id VARCHAR(128) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id VARCHAR(128) NOT NULL,
        epoch BIGINT NOT NULL DEFAULT 1 CHECK (epoch > 0),
        PRIMARY KEY (workspace_id, user_id)
      );
      INSERT INTO workspace_access_epochs(workspace_id,user_id)
        SELECT id,user_id FROM workspaces WHERE user_id IS NOT NULL
        ON CONFLICT DO NOTHING;
      INSERT INTO workspace_access_epochs(workspace_id,user_id)
        SELECT workspace_id,user_id FROM workspace_collaborators
        ON CONFLICT DO NOTHING;

      CREATE OR REPLACE FUNCTION meshwork_bump_collaborator_epoch() RETURNS trigger AS $$
      DECLARE ws_id VARCHAR(128); subject_id VARCHAR(128);
      BEGIN
        IF TG_OP = 'UPDATE' AND (NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
          IF EXISTS (SELECT 1 FROM workspaces WHERE id=OLD.workspace_id) THEN
            INSERT INTO workspace_access_epochs(workspace_id,user_id,epoch) VALUES(OLD.workspace_id,OLD.user_id,1)
            ON CONFLICT(workspace_id,user_id) DO UPDATE SET epoch=workspace_access_epochs.epoch+1;
          END IF;
        ELSIF TG_OP = 'UPDATE' AND NEW.permission IS NOT DISTINCT FROM OLD.permission THEN
          RETURN NEW;
        END IF;
        IF TG_OP = 'DELETE' THEN ws_id := OLD.workspace_id; subject_id := OLD.user_id;
        ELSE ws_id := NEW.workspace_id; subject_id := NEW.user_id; END IF;
        -- A cascading workspace deletion has already removed the parent.
        IF EXISTS (SELECT 1 FROM workspaces WHERE id=ws_id) THEN
          INSERT INTO workspace_access_epochs(workspace_id,user_id,epoch) VALUES(ws_id,subject_id,1)
          ON CONFLICT(workspace_id,user_id) DO UPDATE SET epoch=workspace_access_epochs.epoch+1;
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS workspace_collaborator_epoch ON workspace_collaborators;
      CREATE TRIGGER workspace_collaborator_epoch AFTER INSERT OR UPDATE OR DELETE ON workspace_collaborators
        FOR EACH ROW EXECUTE FUNCTION meshwork_bump_collaborator_epoch();

      CREATE OR REPLACE FUNCTION meshwork_bump_owner_epoch() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'UPDATE' AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN RETURN NEW; END IF;
        IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL THEN
          INSERT INTO workspace_access_epochs(workspace_id,user_id,epoch) VALUES(NEW.id,OLD.user_id,1)
          ON CONFLICT(workspace_id,user_id) DO UPDATE SET epoch=workspace_access_epochs.epoch+1;
        END IF;
        IF NEW.user_id IS NOT NULL THEN
          INSERT INTO workspace_access_epochs(workspace_id,user_id,epoch) VALUES(NEW.id,NEW.user_id,1)
          ON CONFLICT(workspace_id,user_id) DO UPDATE SET epoch=workspace_access_epochs.epoch+1;
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS workspace_owner_epoch ON workspaces;
      CREATE TRIGGER workspace_owner_epoch AFTER INSERT OR UPDATE OF user_id ON workspaces
        FOR EACH ROW EXECUTE FUNCTION meshwork_bump_owner_epoch();
    `,
  },
];
