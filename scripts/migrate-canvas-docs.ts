#!/usr/bin/env npx tsx
import "dotenv/config";
import {
  DynamoCanvasStorage,
  scanCanvasWorkspaceIds,
} from "../server/services/canvas/db/dynamo";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const toLegacy = process.argv.includes("--to-legacy");
  const storage = new DynamoCanvasStorage();
  const workspaceIds = await scanCanvasWorkspaceIds();

  console.log(
    `Found ${workspaceIds.length} canvas workspace${workspaceIds.length === 1 ? "" : "s"}${dryRun ? " (dry run)" : ""}${toLegacy ? " (document → legacy)" : ""}`,
  );

  if (toLegacy) {
    let restored = 0;
    let skipped = 0;
    let empty = 0;
    let failed = 0;

    for (const workspaceId of workspaceIds) {
      if (dryRun) {
        console.log(`would restore legacy ${workspaceId}`);
        continue;
      }
      try {
        const result = await storage.restoreLegacyFromDoc(workspaceId);
        if (result === "restored") restored += 1;
        else if (result === "skipped") skipped += 1;
        else empty += 1;
        console.log(`${workspaceId}: ${result}`);
      } catch (err) {
        failed += 1;
        console.error(`${workspaceId}: failed — ${(err as Error).message}`);
      }
    }

    console.log(
      `Done. restored=${restored} skipped=${skipped} empty=${empty} failed=${failed}`,
    );
    if (failed > 0) process.exitCode = 1;
    return;
  }

  let created = 0;
  let updated = 0;
  let exists = 0;
  let empty = 0;
  let failed = 0;

  for (const workspaceId of workspaceIds) {
    if (dryRun) {
      console.log(`would backfill ${workspaceId}`);
      continue;
    }
    try {
      const result = await storage.backfillCanvas(workspaceId);
      if (result === "created") created += 1;
      else if (result === "updated") updated += 1;
      else if (result === "exists") exists += 1;
      else empty += 1;
      console.log(`${workspaceId}: ${result}`);
    } catch (err) {
      failed += 1;
      console.error(`${workspaceId}: failed — ${(err as Error).message}`);
    }
  }

  console.log(
    `Done. created=${created} updated=${updated} exists=${exists} empty=${empty} failed=${failed}`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
