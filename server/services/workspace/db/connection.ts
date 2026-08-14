import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { db as sharedDb, pool as sharedPool } from "@server/lib/db";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("workspace-db");

const { Pool } = pg;
const workspaceConnectionString = process.env.WORKSPACE_DATABASE_URL;

export const pool = workspaceConnectionString
  ? new Pool({ connectionString: workspaceConnectionString })
  : sharedPool;

export const db = workspaceConnectionString
  ? drizzle(pool, { schema })
  : sharedDb;

log.info("Workspace DB connection initialized");
