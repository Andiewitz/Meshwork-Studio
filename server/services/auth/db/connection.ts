import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { db as sharedDb, pool as sharedPool } from "@server/lib/db";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("auth-db");

const { Pool } = pg;

// Only create a separate pool if AUTH_DATABASE_URL explicitly points
// to a different database. Otherwise reuse the shared pool.
const authConnectionString = process.env.AUTH_DATABASE_URL;

export const pool = authConnectionString
  ? new Pool({ connectionString: authConnectionString })
  : sharedPool;

export const db = authConnectionString ? drizzle(pool, { schema }) : sharedDb;

log.info("Auth DB connection initialized");
