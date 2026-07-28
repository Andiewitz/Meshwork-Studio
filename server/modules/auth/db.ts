/**
 * Auth module database access.
 * Uses the shared server-wide pool from server/lib/db.
 * The auth module supports an optional AUTH_DATABASE_URL env var for cases
 * where auth data is on a separate Postgres instance (e.g., a dedicated auth
 * database). If AUTH_DATABASE_URL is not set, it falls back to the shared pool.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { db as sharedDb, pool as sharedPool } from "../../lib/db";
import { createChildLogger } from "../../lib/logger";

const log = createChildLogger("auth-db");

const { Pool } = pg;

// Only create a separate pool if AUTH_DATABASE_URL explicitly points
// to a different database. Otherwise reuse the shared pool.
const authConnectionString = process.env.AUTH_DATABASE_URL;

export const pool = authConnectionString
  ? new Pool({ connectionString: authConnectionString })
  : sharedPool;

export const db = authConnectionString ? drizzle(pool, { schema }) : sharedDb;

log.info("Auth db module initialized");
