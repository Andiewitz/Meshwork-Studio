import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { db as sharedDb, pool as sharedPool } from "@server/lib/db";
import { createChildLogger } from "@server/lib/logger";

const log = createChildLogger("canvas-db");

const { Pool } = pg;
const canvasConnectionString = process.env.CANVAS_DATABASE_URL;

export const pool = canvasConnectionString
  ? new Pool({ connectionString: canvasConnectionString })
  : sharedPool;

export const db = canvasConnectionString ? drizzle(pool, { schema }) : sharedDb;

log.info("Canvas DB connection initialized");
