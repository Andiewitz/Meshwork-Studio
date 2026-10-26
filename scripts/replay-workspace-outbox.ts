import "dotenv/config";
import { pool } from "../server/services/workspace/db/connection";
import { PostgresWorkspaceOutboxStore } from "../server/services/workspace/outbox-store";

// Run from a trusted checkout with workspace_db access after following the runbook.
async function main(): Promise<void> {
  const [operationId, confirmation, ...extra] = process.argv.slice(2);
  if (
    !operationId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      operationId,
    ) ||
    confirmation !== "--workers-stopped" ||
    extra.length
  ) {
    throw new Error(
      "Usage: npx tsx scripts/replay-workspace-outbox.ts <operation-uuid> --workers-stopped",
    );
  }
  const replayed = await new PostgresWorkspaceOutboxStore(
    pool,
  ).replayDeadLetter(operationId);
  if (!replayed)
    throw new Error(
      "Operation is not eligible for dead-letter replay; no changes made",
    );
  console.info(`Outbox operation ${operationId} queued for replay`);
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Outbox replay failed",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
