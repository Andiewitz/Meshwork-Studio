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
import { requiredDatabaseTargets, requiredS3Uri } from "./backup-lib";

interface ArchiveFile {
  name: string;
  bytes: number;
  sha256: string;
}

interface ArchiveManifest {
  version: 1;
  createdAt: string;
  databaseArtifacts: string[];
  canvasTable: string;
  files: ArchiveFile[];
  offsitePrefix: string;
}

const production = process.env.NODE_ENV === "production";
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.resolve(process.env.BACKUP_OUTPUT_DIR || "backups");
const finalDirectory = path.join(outputRoot, timestamp);
const stagingDirectory = path.join(outputRoot, `.${timestamp}.partial`);
const tableName = process.env.CANVAS_DDB_TABLE;
const awsRegion = process.env.AWS_REGION || "us-east-1";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: "inherit" });
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

async function dumpPostgres(staging: string): Promise<string[]> {
  const targets = requiredDatabaseTargets(process.env);
  const pgDump = process.env.PG_DUMP_BIN || "pg_dump";
  const output: string[] = [];
  for (const target of targets) {
    const filePath = path.join(staging, `${target.name}.dump`);
    console.log(`[Backup] Dumping ${target.name} database`);
    await run(pgDump, [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--file=${filePath}`,
      target.url,
    ]);
    output.push(filePath);
  }

  const globalsUrl = process.env.BACKUP_POSTGRES_SUPERUSER_URL;
  if (globalsUrl) {
    const globalsPath = path.join(staging, "postgres-globals.sql");
    console.log("[Backup] Dumping PostgreSQL globals");
    await run(process.env.PG_DUMPALL_BIN || "pg_dumpall", [
      "--globals-only",
      `--file=${globalsPath}`,
      `--database=${globalsUrl}`,
    ]);
    output.push(globalsPath);
  } else if (production) {
    throw new Error(
      "BACKUP_POSTGRES_SUPERUSER_URL is required in production to preserve PostgreSQL roles",
    );
  }
  return output;
}

async function writeCanvasSnapshot(staging: string): Promise<string> {
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
  return filePath;
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

  const postgresFiles = await dumpPostgres(stagingDirectory);
  const canvasFile = await writeCanvasSnapshot(stagingDirectory);
  const files = [...postgresFiles, canvasFile];
  const archiveFiles = await Promise.all(files.map(describeFile));
  const manifest: ArchiveManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    databaseArtifacts: postgresFiles.map((file) => path.basename(file)),
    canvasTable: tableName!,
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
