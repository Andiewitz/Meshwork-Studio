#!/usr/bin/env node
/**
 * Complete backup archive for the database-per-service topology and canvas.
 * It fails closed: production needs every DSN, an S3 destination, and PITR.
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DescribeContinuousBackupsCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import pg from "pg";
import { requiredDatabaseTargets, requiredS3Uri } from "./backup-lib";

interface ArchiveFile {
  name: string;
  bytes: number;
  sha256: string;
}

interface ArchiveManifest {
  version: 2;
  createdAt: string;
  databaseArtifacts: DatabaseArtifact[];
  canvasTable: string;
  canvasItemCount: number;
  files: ArchiveFile[];
  offsitePrefix: string;
}

interface DatabaseArtifact {
  name: string;
  file: string;
  tableRows: Record<string, string>;
}

const production = process.env.NODE_ENV === "production";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.resolve(process.env.BACKUP_OUTPUT_DIR || "backups");
const finalDirectory = path.join(outputRoot, timestamp);
const stagingDirectory = path.join(outputRoot, `.${timestamp}.partial`);
const tableName = process.env.CANVAS_DDB_TABLE;
const awsRegion = process.env.AWS_REGION || "us-east-1";

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: "inherit",
      env,
    });
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

async function countTableRows(
  client: pg.Client,
): Promise<Record<string, string>> {
  const tables = await client.query<{
    table_schema: string;
    table_name: string;
  }>(
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name",
  );
  const counts: Record<string, string> = {};
  for (const table of tables.rows) {
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${quoteIdentifier(table.table_schema)}.${quoteIdentifier(table.table_name)}`,
    );
    counts[`${table.table_schema}.${table.table_name}`] = result.rows[0].count;
  }
  return counts;
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function describeFile(filePath: string): Promise<ArchiveFile> {
  return {
    name: path.basename(filePath),
    bytes: (await stat(filePath)).size,
    sha256: await sha256(filePath),
  };
}

async function dumpPostgres(staging: string): Promise<{
  files: string[];
  artifacts: DatabaseArtifact[];
}> {
  const targets = requiredDatabaseTargets(process.env);
  const pgDump = process.env.PG_DUMP_BIN || "pg_dump";
  const files: string[] = [];
  const artifacts: DatabaseArtifact[] = [];
  for (const target of targets) {
    const filePath = path.join(staging, `${target.name}.dump`);
    console.log(`[Backup] Dumping ${target.name} database`);
    const client = new pg.Client({ connectionString: target.url });
    await client.connect();
    try {
      await client.query(
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const snapshot = await client.query<{ snapshot: string }>(
        "SELECT pg_export_snapshot() AS snapshot",
      );
      await run(
        pgDump,
        [
          "--format=custom",
          "--no-owner",
          "--no-privileges",
          `--snapshot=${snapshot.rows[0].snapshot}`,
          `--file=${filePath}`,
        ],
        postgresEnvironment(target.url),
      );
      artifacts.push({
        name: target.name,
        file: path.basename(filePath),
        tableRows: await countTableRows(client),
      });
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      await client.end();
    }
    files.push(filePath);
  }

  const globalsUrl = process.env.BACKUP_POSTGRES_SUPERUSER_URL;
  if (globalsUrl) {
    const globalsPath = path.join(staging, "postgres-globals.sql");
    console.log("[Backup] Dumping PostgreSQL globals");
    await run(
      process.env.PG_DUMPALL_BIN || "pg_dumpall",
      ["--globals-only", `--file=${globalsPath}`],
      postgresEnvironment(globalsUrl),
    );
    files.push(globalsPath);
  } else if (production) {
    throw new Error(
      "BACKUP_POSTGRES_SUPERUSER_URL is required in production to preserve PostgreSQL roles",
    );
  }
  return { files, artifacts };
}

async function writeCanvasSnapshot(
  staging: string,
): Promise<{ filePath: string; itemCount: number }> {
  if (!tableName) throw new Error("CANVAS_DDB_TABLE is required for a backup");
  if (production && process.env.DYNAMODB_ENDPOINT) {
    throw new Error(
      "Production canvas must use managed DynamoDB; local DynamoDB has no PITR",
    );
  }

  const client = new DynamoDBClient({
    region: awsRegion,
    ...(process.env.DYNAMODB_ENDPOINT
      ? {
          endpoint: process.env.DYNAMODB_ENDPOINT,
          credentials: { accessKeyId: "local", secretAccessKey: "local" },
        }
      : {}),
  });
  if (production) {
    const status = await client.send(
      new DescribeContinuousBackupsCommand({ TableName: tableName }),
    );
    const pitr =
      status.ContinuousBackupsDescription?.PointInTimeRecoveryDescription
        ?.PointInTimeRecoveryStatus;
    if (pitr !== "ENABLED") {
      client.destroy();
      throw new Error(
        "DynamoDB point-in-time recovery must be ENABLED before production backup",
      );
    }
  }
  const doc = DynamoDBDocumentClient.from(client);
  const filePath = path.join(staging, "canvas.ndjson");
  const stream = createWriteStream(filePath, { encoding: "utf8" });
  let cursor: Record<string, unknown> | undefined;
  let itemCount = 0;
  try {
    do {
      const page = await doc.send(
        new ScanCommand({
          TableName: tableName,
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
        }),
      );
      for (const item of page.Items ?? []) {
        if (!stream.write(`${JSON.stringify(item)}\n`)) {
          await new Promise<void>((resolve, reject) => {
            stream.once("drain", resolve);
            stream.once("error", reject);
          });
        }
        itemCount += 1;
      }
      cursor = page.LastEvaluatedKey;
    } while (cursor);
    await new Promise<void>((resolve, reject) => {
      stream.once("error", reject);
      stream.end(resolve);
    });
  } catch (err) {
    stream.destroy();
    throw err;
  } finally {
    client.destroy();
  }
  console.log(`[Backup] Captured ${itemCount} canvas items`);
  return { filePath, itemCount };
}

function s3Destination(prefix: string, archiveName: string, fileName: string) {
  return `${prefix}/${archiveName}/${fileName}`;
}

async function uploadArchive(
  prefix: string,
  archiveName: string,
  files: string[],
): Promise<void> {
  const aws = process.env.AWS_CLI_BIN || "aws";
  const encryptionArgs = process.env.BACKUP_S3_KMS_KEY_ID
    ? ["--sse", "aws:kms", "--sse-kms-key-id", process.env.BACKUP_S3_KMS_KEY_ID]
    : ["--sse", "AES256"];
  for (const filePath of files) {
    await run(aws, [
      "s3",
      "cp",
      filePath,
      s3Destination(prefix, archiveName, path.basename(filePath)),
      "--only-show-errors",
      ...encryptionArgs,
    ]);
  }
}

async function backup(): Promise<void> {
  const offsitePrefix = requiredS3Uri(process.env);
  if (production && !tableName) {
    throw new Error("CANVAS_DDB_TABLE is required in production");
  }
  await mkdir(stagingDirectory, { recursive: false });
  console.log(`[Backup] Writing staged archive ${stagingDirectory}`);

  const postgres = await dumpPostgres(stagingDirectory);
  const canvas = await writeCanvasSnapshot(stagingDirectory);
  const files = [...postgres.files, canvas.filePath];
  const archiveFiles = await Promise.all(files.map(describeFile));
  const manifest: ArchiveManifest = {
    version: 2,
    createdAt: new Date().toISOString(),
    databaseArtifacts: postgres.artifacts,
    canvasTable: tableName!,
    canvasItemCount: canvas.itemCount,
    files: archiveFiles,
    offsitePrefix,
  };
  const manifestPath = path.join(stagingDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // Upload data first, then completion marker. A prefix without the manifest is
  // incomplete and must never be selected for a restore.
  await uploadArchive(offsitePrefix, timestamp, files);
  await uploadArchive(offsitePrefix, timestamp, [manifestPath]);
  await rename(stagingDirectory, finalDirectory);
  console.log(`[Backup] Complete: ${finalDirectory}`);
}

backup().catch((err) => {
  console.error(`[Backup] Failed: ${(err as Error).message}`);
  process.exitCode = 1;
});
