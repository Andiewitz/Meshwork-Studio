import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { CanvasDocConfigError } from "./errors";
import type { CanvasObjectStore } from "./snapshots";

const region = process.env.AWS_REGION || "us-east-1";
let client: S3Client | undefined;
function s3(): S3Client {
  if (!client) {
    const endpoint = process.env.S3_ENDPOINT;
    client = new S3Client({
      region,
      endpoint,
      forcePathStyle: Boolean(endpoint),
      ...(endpoint
        ? {
            credentials: {
              accessKeyId:
                process.env.S3_ACCESS_KEY_ID ||
                process.env.AWS_ACCESS_KEY_ID ||
                "local",
              secretAccessKey:
                process.env.S3_SECRET_ACCESS_KEY ||
                process.env.AWS_SECRET_ACCESS_KEY ||
                "local",
            },
          }
        : {}),
    });
  }
  return client;
}
function bucket(): string {
  const name = process.env.CANVAS_S3_BUCKET;
  if (!name)
    throw new CanvasDocConfigError(
      "CANVAS_S3_BUCKET is required for S3 canvas documents",
    );
  return name;
}
function workspacePrefix(workspaceId: string): string {
  const prefix = (process.env.CANVAS_S3_PREFIX || "canvases").replace(
    /^\/+|\/+$/g,
    "",
  );
  return `${prefix ? `${prefix}/` : ""}${encodeURIComponent(workspaceId)}/`;
}

export function closeCanvasS3(): void {
  client?.destroy();
  client = undefined;
}

export const s3CanvasObjects: CanvasObjectStore = {
  async put(workspaceId, body) {
    const key = `${workspacePrefix(workspaceId)}${randomUUID()}.json.gz`;
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: body,
        ContentType: "application/json",
        ContentEncoding: "gzip",
      }),
    );
    return key;
  },
  async get(key) {
    const result = await s3().send(
      new GetObjectCommand({ Bucket: bucket(), Key: key }),
    );
    if (!result.Body?.transformToByteArray)
      throw new Error("Canvas object has no readable body");
    return result.Body.transformToByteArray();
  },
  async remove(key) {
    await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  },
  async purge(workspaceId, required) {
    if (!process.env.CANVAS_S3_BUCKET && !required) return;
    const Bucket = bucket();
    const Prefix = workspacePrefix(workspaceId);
    let token: string | undefined;
    do {
      const page = await s3().send(
        new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token }),
      );
      if (
        (page.Contents ?? []).some(
          (item) => item.Key && !item.Key.startsWith(Prefix),
        )
      )
        throw new Error(
          "Canvas S3 listing contained an object outside the workspace prefix",
        );
      const objects = (page.Contents ?? []).flatMap((item) =>
        item.Key ? [{ Key: item.Key }] : [],
      );
      if (objects.length) {
        const result = await s3().send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        if (result.Errors?.length)
          throw new Error("Some canvas S3 objects could not be deleted");
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !token)
        throw new Error("Canvas S3 listing returned no continuation token");
    } while (token);
  },
};
