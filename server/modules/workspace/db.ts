/**
 * Workspace module database access.
 * Uses the shared server-wide pool from server/lib/db.
 */
import { db, pool } from "../../lib/db";
import { createChildLogger } from "../../lib/logger";

const log = createChildLogger("workspace-db");

export { db, pool };

log.info("Workspace db module initialized (using shared pool)");
