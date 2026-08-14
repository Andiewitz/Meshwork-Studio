import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { db as sharedDb, pool as sharedPool } from "@server/lib/db";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("ai-db");

const { Pool } = pg;
const aiConnectionString = process.env.AI_DATABASE_URL;

export const pool = aiConnectionString
  ? new Pool({ connectionString: aiConnectionString })
  : sharedPool;

export const db = aiConnectionString ? drizzle(pool, { schema }) : sharedDb;

log.info("AI DB connection initialized");
