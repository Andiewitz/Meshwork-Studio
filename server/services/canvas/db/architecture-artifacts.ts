import { randomUUID } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  createArchitectureArtifactSchema,
  planToMarkdown,
  type ArchitectureArtifact,
  type CreateArchitectureArtifact,
} from "@shared/architecture-plan";

export interface ArchitectureArtifactStore {
  create(
    workspaceId: string,
    input: CreateArchitectureArtifact,
  ): Promise<ArchitectureArtifact>;
  list(workspaceId: string): Promise<{ id: string; createdAt: string }[]>;
  get(workspaceId: string, id: string): Promise<ArchitectureArtifact | null>;
  purge(workspaceId: string): Promise<void>;
}

let client: S3Client | undefined;
function s3() {
  if (!client) {
    const endpoint = process.env.S3_ENDPOINT;
    client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
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
export function closeArchitectureArtifacts() {
  client?.destroy();
  client = undefined;
}
function bucket() {
  if (!process.env.ARTIFACT_S3_BUCKET)
    throw new Error("Architecture plan storage is not configured.");
  return process.env.ARTIFACT_S3_BUCKET;
}
function prefix(workspaceId: string) {
  return `projects/${encodeURIComponent(workspaceId)}/plans/`;
}
const idPattern =
  /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function key(workspaceId: string, id: string) {
  if (!idPattern.test(id)) throw new Error("Invalid artifact ID");
  return `${prefix(workspaceId)}${id}.json`;
}

async function keys(workspaceId: string) {
  const result: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        Prefix: prefix(workspaceId),
        ContinuationToken: token,
      }),
    );
    for (const entry of page.Contents ?? [])
      if (entry.Key?.startsWith(prefix(workspaceId))) result.push(entry.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !token)
      throw new Error("Artifact listing is incomplete.");
  } while (token);
  return result;
}

export const architectureArtifacts: ArchitectureArtifactStore = {
  async create(workspaceId, input) {
    const validated = createArchitectureArtifactSchema.parse(input);
    const now = Date.now();
    const artifact: ArchitectureArtifact = {
      ...validated,
      id: `${now}-${randomUUID()}`,
      createdAt: new Date(now).toISOString(),
      markdown: planToMarkdown(validated.plan),
    };
    await s3().send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key(workspaceId, artifact.id),
        Body: JSON.stringify(artifact),
        ContentType: "application/json; charset=utf-8",
      }),
    );
    return artifact;
  },
  async list(workspaceId) {
    return (await keys(workspaceId))
      .flatMap((objectKey) => {
        const id = objectKey
          .slice(prefix(workspaceId).length)
          .replace(/\.json$/, "");
        return idPattern.test(id)
          ? [{ id, createdAt: new Date(Number(id.slice(0, 13))).toISOString() }]
          : [];
      })
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, 50);
  },
  async get(workspaceId, id) {
    if (!idPattern.test(id)) return null;
    try {
      const object = await s3().send(
        new GetObjectCommand({ Bucket: bucket(), Key: key(workspaceId, id) }),
      );
      if ((object.ContentLength ?? 0) > 1_000_000 || !object.Body)
        throw new Error("Invalid architecture artifact.");
      const raw = JSON.parse(
        await object.Body.transformToString(),
      ) as ArchitectureArtifact;
      const parsed = createArchitectureArtifactSchema.parse(raw);
      return {
        ...parsed,
        id,
        createdAt: new Date(Number(id.slice(0, 13))).toISOString(),
        markdown: planToMarkdown(parsed.plan),
      };
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return null;
      throw error;
    }
  },
  async purge(workspaceId) {
    if (!process.env.ARTIFACT_S3_BUCKET) return;
    const objects = await keys(workspaceId);
    for (let index = 0; index < objects.length; index += 1000) {
      const response = await s3().send(
        new DeleteObjectsCommand({
          Bucket: bucket(),
          Delete: {
            Objects: objects.slice(index, index + 1000).map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
      if (response.Errors?.length)
        throw new Error("Could not delete all project artifacts.");
    }
  },
};
