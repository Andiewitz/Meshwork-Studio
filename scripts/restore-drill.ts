#!/usr/bin/env node
/**
 * Restore a v2 archive into isolated drill targets only. It deliberately never
 * creates, deletes, or targets active databases/tables.
 */

import "dotenv/config";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import pg from "pg";
import {
  requiredRestoreCanvasTable,
  requiredRestoreDatabaseTargets,
} from "./backup-lib";

interface ArchiveFile {
  name: string;
  bytes: number;
  sha256: string;
}

interface DatabaseArtifact {
  name: string;
  file: string;
  tableRows: Record<string, string>;
}

interface ArchiveManifest {
  version: 2;
  createdAt: string;
  databaseArtifacts: DatabaseArtifact[];
  canvasTable: string;
  canvasItemCount: number;
  files: ArchiveFile[];
}

type WriteRequest = { PutRequest: { Item: Record<string, unknown> } };

const archiveDirectory = process.env.RESTORE_ARCHIVE_DIR
  ? path.resolve(process.env.RESTORE_ARCHIVE_DIR)
  : "";
const region = process.env.AWS_REGION || "us-east-1";

function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: "inherit", env });
    child.on("error", (err) =>
      reject(new Error(`Could not start ${command}: ${err.message}`)),
    );
    child.on("exit", (code, signal) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          `${command} failed (${signal ? `signal ${signal}` : `exit ${code ?? "unknown"}`})`,
        ),
      );
    });
  });
}

function postgresEnvironment(urlValue: string): NodeJS.ProcessEnv {
  const url = new URL(urlValue);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    ...(url.searchParams.get("sslmode")
      ? { PGSSLMODE: url.searchParams.get("sslmode")! }
      : {}),
  };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function manifestFrom(value: unknown): ArchiveManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid manifest");
  const manifest = value as Partial<ArchiveManifest>;
  if (
    manifest.version !== 2 ||
    !Array.isArray(manifest.files) ||
    !Array.isArray(manifest.databaseArtifacts) ||
    typeof manifest.canvasItemCount !== "number"
  ) {
    throw new Error("Archive must have a complete version 2 manifest");
  }
  return manifest as ArchiveManifest;
}

async function verifyArchive(): Promise<ArchiveManifest> {
  if (!archiveDirectory) throw new Error("RESTORE_ARCHIVE_DIR is required");
  const manifest = manifestFrom(
    JSON.parse(
      await readFile(path.join(archiveDirectory, "manifest.json"), "utf8"),
    ),
  );
  for (const file of manifest.files) {
    const filePath = path.join(archiveDirectory, file.name);
    const metadata = await stat(filePath);
    if (
      metadata.size !== file.bytes ||
      (await sha256(filePath)) !== file.sha256
    ) {
      throw new Error(`Archive checksum mismatch for ${file.name}`);
    }
  }
  if (!manifest.files.some((file) => file.name === "canvas.ndjson")) {
    throw new Error("Archive is missing canvas.ndjson");
  }
  return manifest;
}

async function tableRows(client: pg.Client): Promise<Record<string, string>> {
  const tables = await client.query<{
    table_schema: string;
    table_name: string;
  }>(
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name",
  );
  const counts: Record<string, string> = {};
  for (const table of tables.rows) {
    const rows = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`,
    );
    counts[`${table.table_schema}.${table.table_name}`] = rows.rows[0].count;
  }
  return counts;
}

async function assertEmptyDatabase(url: string, name: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const tables = await tableRows(client);
    if (Object.keys(tables).length > 0) {
      throw new Error(`Restore target ${name} is not empty`);
    }
  } finally {
    await client.end();
  }
}

async function restorePostgres(manifest: ArchiveManifest): Promise<void> {
  const targets = requiredRestoreDatabaseTargets(process.env);
  const byName = new Map(
    manifest.databaseArtifacts.map((item) => [item.name, item]),
  );
  for (const target of targets) {
    const artifact = byName.get(target.name);
    if (!artifact) throw new Error(`Archive is missing ${target.name}.dump`);
    await assertEmptyDatabase(target.url, target.name);
  }
  for (const target of targets) {
    const artifact = byName.get(target.name)!;
    console.log(`[Restore] Restoring ${target.name} database`);
    await run(
      process.env.PG_RESTORE_BIN || "pg_restore",
      [
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        path.join(archiveDirectory, artifact.file),
      ],
      postgresEnvironment(target.url),
    );
    const client = new pg.Client({ connectionString: target.url });
    await client.connect();
    try {
      const restoredRows = await tableRows(client);
      if (JSON.stringify(restoredRows) !== JSON.stringify(artifact.tableRows)) {
        throw new Error(`Row-count validation failed for ${target.name}`);
      }
    } finally {
      await client.end();
    }
  }
}

function dynamoClient() {
  const endpoint = process.env.RESTORE_DYNAMODB_ENDPOINT;
  const client = new DynamoDBClient({
    region,
    ...(endpoint
      ? {
          endpoint,
          credentials: { accessKeyId: "local", secretAccessKey: "local" },
        }
      : {}),
  });
  return { client, doc: DynamoDBDocumentClient.from(client) };
}

async function countCanvasItems(
  doc: DynamoDBDocumentClient,
  tableName: string,
): Promise<number> {
  let cursor: Record<string, unknown> | undefined;
  let count = 0;
  do {
    const page = await doc.send(
      new ScanCommand({
        TableName: tableName,
        Select: "COUNT",
        ConsistentRead: true,
        ExclusiveStartKey: cursor,
      }),
    );
    count += page.Count ?? 0;
    cursor = page.LastEvaluatedKey;
  } while (cursor);
  return count;
}

async function writeBatch(
  doc: DynamoDBDocumentClient,
  tableName: string,
  requests: WriteRequest[],
): Promise<void> {
  let pending = requests;
  for (let attempt = 0; pending.length > 0 && attempt < 6; attempt += 1) {
    const response = await doc.send(
      new BatchWriteCommand({ RequestItems: { [tableName]: pending } }),
    );
    pending = (response.UnprocessedItems?.[tableName] ?? []) as WriteRequest[];
    if (pending.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
  if (pending.length > 0) {
    throw new Error(
      `DynamoDB left ${pending.length} restore writes unprocessed`,
    );
  }
}

async function restoreCanvas(manifest: ArchiveManifest): Promise<void> {
  const tableName = requiredRestoreCanvasTable(process.env);
  const { client, doc } = dynamoClient();
  try {
    if ((await countCanvasItems(doc, tableName)) !== 0) {
      throw new Error("Restore canvas table is not empty");
    }
    const batch: WriteRequest[] = [];
    const input = readline.createInterface({
      input: createReadStream(path.join(archiveDirectory, "canvas.ndjson")),
      crlfDelay: Infinity,
    });
    for await (const line of input) {
      if (!line) continue;
      batch.push({ PutRequest: { Item: JSON.parse(line) } });
      if (batch.length === 25) {
        await writeBatch(doc, tableName, batch.splice(0));
      }
    }
    if (batch.length > 0) await writeBatch(doc, tableName, batch);
    const restoredCount = await countCanvasItems(doc, tableName);
    if (restoredCount !== manifest.canvasItemCount) {
      throw new Error(
        `Canvas count validation failed: expected ${manifest.canvasItemCount}, got ${restoredCount}`,
      );
    }
    console.log(`[Restore] Validated ${restoredCount} canvas items`);
  } finally {
    client.destroy();
  }
}

async function restoreDrill(): Promise<void> {
  if (process.env.RESTORE_MODE !== "drill") {
    throw new Error(
      "RESTORE_MODE=drill is required; production cutovers are manual",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Restore drills must not run with NODE_ENV=production");
  }
  const startedAt = Date.now();
  const manifest = await verifyArchive();
  await restorePostgres(manifest);
  await restoreCanvas(manifest);
  console.log(`[Restore] Drill complete in ${Date.now() - startedAt}ms`);
}

restoreDrill().catch((err) => {
  console.error(`[Restore] Failed: ${(err as Error).message}`);
  process.exitCode = 1;
});
