import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = send;
  },
  PutObjectCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
  GetObjectCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
  DeleteObjectCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
  ListObjectsV2Command: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
  DeleteObjectsCommand: class {
    constructor(readonly input: Record<string, unknown>) {}
  },
}));
import { s3CanvasObjects } from "@services/canvas/db/s3-objects";
import {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

beforeEach(() => {
  vi.stubEnv("CANVAS_S3_BUCKET", "test-bucket");
  vi.stubEnv("CANVAS_S3_PREFIX", "canvas-prefix");
  send.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("S3 canvas object adapter", () => {
  it("writes and reads gzip objects under the scoped workspace prefix", async () => {
    send.mockResolvedValueOnce({});
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2]) },
    });
    const key = await s3CanvasObjects.put("a/b", new Uint8Array([1, 2]));
    expect(key).toMatch(/^canvas-prefix\/a%2Fb\/[^/]+\.json\.gz$/);
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: "test-bucket",
      Key: key,
      ContentEncoding: "gzip",
    });
    expect(await s3CanvasObjects.get(key)).toEqual(new Uint8Array([1, 2]));
    expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
  });

  it("lists and deletes every object page when a workspace is deleted", async () => {
    send.mockResolvedValueOnce({
      Contents: [{ Key: "canvas-prefix/ws/one" }],
      IsTruncated: true,
      NextContinuationToken: "next",
    });
    send.mockResolvedValueOnce({});
    send.mockResolvedValueOnce({
      Contents: [{ Key: "canvas-prefix/ws/two" }],
      IsTruncated: false,
    });
    send.mockResolvedValueOnce({});
    await s3CanvasObjects.purge("ws", true);
    expect(send.mock.calls.map(([command]) => command.constructor)).toEqual([
      ListObjectsV2Command,
      DeleteObjectsCommand,
      ListObjectsV2Command,
      DeleteObjectsCommand,
    ]);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: "test-bucket",
      Prefix: "canvas-prefix/ws/",
    });
    expect(send.mock.calls[2][0].input).toMatchObject({
      ContinuationToken: "next",
    });
  });

  it("fails when S3 reports partial deletion so the outbox can retry", async () => {
    send.mockResolvedValueOnce({
      Contents: [{ Key: "canvas-prefix/ws/one" }],
      IsTruncated: false,
    });
    send.mockResolvedValueOnce({ Errors: [{ Key: "canvas-prefix/ws/one" }] });
    await expect(s3CanvasObjects.purge("ws", true)).rejects.toThrow(
      "could not be deleted",
    );
  });

  it("never deletes an object returned outside the requested workspace prefix", async () => {
    send.mockResolvedValueOnce({
      Contents: [{ Key: "canvas-prefix/other/private" }],
      IsTruncated: false,
    });
    await expect(s3CanvasObjects.purge("ws", true)).rejects.toThrow(
      "outside the workspace prefix",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("distinguishes optional absent storage from required missing configuration", async () => {
    vi.stubEnv("CANVAS_S3_BUCKET", "");
    await expect(s3CanvasObjects.purge("ws", false)).resolves.toBeUndefined();
    await expect(s3CanvasObjects.purge("ws", true)).rejects.toMatchObject({
      code: "CANVAS_DOC_CONFIG",
    });
    await expect(
      s3CanvasObjects.put("ws", new Uint8Array([1])),
    ).rejects.toMatchObject({ code: "CANVAS_DOC_CONFIG" });
    expect(send).not.toHaveBeenCalled();
  });
});
