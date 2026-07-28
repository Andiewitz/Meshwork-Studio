/**
 * Canvas module database access.
 * Uses the shared server-wide pool from server/lib/db.
 */
import { db, pool } from "../../lib/db";
import { createChildLogger } from "../../lib/logger";

const log = createChildLogger("canvas-db");

export { db, pool };

log.info("Canvas db module initialized (using shared pool)");
