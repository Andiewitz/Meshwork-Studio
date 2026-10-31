import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";

/** Stream files in order; callers upload the completion manifest only after
 * this resolves. Credentials come from the SDK provider chain, never arguments.
 */
export async function uploadS3Archive(
  send: (input: PutObjectCommandInput) => Promise<unknown>,
  prefix: string,
  archiveName: string,
  files: string[],
  kmsKey?: string,
): Promise<void> {
  const destination = new URL(prefix);
  if (
    destination.protocol !== "s3:" ||
    !destination.hostname ||
    destination.username ||
    destination.password ||
    destination.port ||
    destination.search ||
    destination.hash
  ) {
    throw new Error("Invalid S3 archive destination");
  }
  for (const file of files) {
    const details = await stat(file);
    const body = createReadStream(file);
    try {
      await send({
        Bucket: destination.hostname,
        Key: `${decodeURIComponent(destination.pathname).replace(/^\/+|\/+$/g, "")}/${archiveName}/${path.basename(file)}`.replace(
          /^\//,
          "",
        ),
        Body: body,
        ContentLength: details.size,
        ServerSideEncryption: kmsKey ? "aws:kms" : "AES256",
        ...(kmsKey ? { SSEKMSKeyId: kmsKey } : {}),
      });
    } finally {
      body.destroy();
    }
  }
}
