import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import path from "node:path";
import { uploadS3Archive } from "../../../scripts/s3-archive";

describe("SDK archive uploads", () => {
  it("streams into the intended prefix with explicit size and encryption", async () => {
    let bytes = 0;
    await uploadS3Archive(
      async (input) => {
        expect(input.Bucket).toBe("backup-bucket");
        expect(input.Key).toBe("daily/archive/package.json");
        expect(input.ServerSideEncryption).toBe("AES256");
        for await (const chunk of input.Body as Readable)
          bytes += (chunk as Buffer).length;
        expect(bytes).toBe(input.ContentLength);
      },
      "s3://backup-bucket/daily/",
      "archive",
      [path.resolve("package.json")],
    );
    expect(bytes).toBeGreaterThan(0);
  });

  it("stops on upload failure before another file can be published", async () => {
    let calls = 0;
    await expect(
      uploadS3Archive(
        async () => {
          calls++;
          throw new Error("upload failed");
        },
        "s3://backup-bucket/daily",
        "archive",
        ["package.json", "README.md"],
      ),
    ).rejects.toThrow("upload failed");
    expect(calls).toBe(1);
  });

  it("rejects query/fragment destinations before sending anything", async () => {
    await expect(
      uploadS3Archive(
        async () => {
          throw new Error("unexpected send");
        },
        "s3://backup-bucket/daily?other=prefix",
        "archive",
        [],
      ),
    ).rejects.toThrow("Invalid S3 archive destination");
  });
});
