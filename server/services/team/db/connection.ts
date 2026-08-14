import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { db as sharedDb, pool as sharedPool } from "@server/lib/db";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("team-db");

const { Pool } = pg;
const teamConnectionString = process.env.TEAM_DATABASE_URL;

export const pool = teamConnectionString
  ? new Pool({ connectionString: teamConnectionString })
  : sharedPool;

export const db = teamConnectionString ? drizzle(pool, { schema }) : sharedDb;

log.info("Team DB connection initialized");
