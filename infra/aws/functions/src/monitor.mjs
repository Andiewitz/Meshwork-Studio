import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
export function makeMonitor({
  s3,
  metrics,
  healthUrl,
  bucket,
  prefix,
  namespace,
  now = Date.now,
  fetcher = fetch,
}) {
  return async (event) => {
    if (event.kind === "health") {
      let available = 0;
      try {
        const result = await fetcher(healthUrl, {
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        });
        available = result.status === 200 ? 1 : 0;
        await result.body?.cancel();
      } catch {
        /* Emit failure even when DNS/HTTP is down. */
      }
      await metrics(
        new PutMetricDataCommand({
          Namespace: namespace,
          MetricData: [
            {
              MetricName: "PublicAvailability",
              Value: available,
              Unit: "Count",
            },
          ],
        }),
      );
      return { available };
    }
    if (event.kind !== "backup") throw new Error("Unknown monitor operation");
    // Limit scan to the last three UTC days of this tool's timestamp-prefixed archives.
    const manifests = [];
    for (let day = 0; day < 3; day++) {
      const date = new Date(now() - day * 86400000).toISOString().slice(0, 10);
      let cursor;
      do {
        const page = await s3(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: `${prefix}${date}`,
            ContinuationToken: cursor,
          }),
        );
        manifests.push(
          ...(page.Contents ?? []).filter((o) =>
            o.Key.endsWith("/manifest.json"),
          ),
        );
        cursor = page.NextContinuationToken;
      } while (cursor);
    }
    manifests.sort((a, b) => b.LastModified - a.LastModified);
    let age = 259200;
    for (const candidate of manifests) {
      try {
        const object = await s3(
          new GetObjectCommand({ Bucket: bucket, Key: candidate.Key }),
        );
        if (object.ContentLength > 1048576)
          throw new Error("Manifest too large");
        const manifest = JSON.parse(await object.Body.transformToString());
        const names = new Set(manifest.files?.map((f) => f.name));
        if (
          manifest.version !== 2 ||
          ![
            "auth.dump",
            "workspace.dump",
            "team.dump",
            "jenkos.dump",
            "metrics.dump",
            "canvas.ndjson",
          ].every((n) => names.has(n))
        )
          throw new Error("Incomplete manifest");
        for (const file of manifest.files) {
          if (
            !/^[a-z0-9.-]+$/.test(file.name) ||
            !Number.isSafeInteger(file.bytes) ||
            file.bytes < 0 ||
            !/^[a-f0-9]{64}$/.test(file.sha256)
          )
            throw new Error("Invalid manifest");
          const head = await s3(
            new HeadObjectCommand({
              Bucket: bucket,
              Key: candidate.Key.replace(/manifest.json$/, file.name),
            }),
          );
          if (head.ContentLength !== file.bytes)
            throw new Error("Archive size mismatch");
        }
        age = Math.max(
          0,
          (now() - new Date(candidate.LastModified).getTime()) / 1000,
        );
        break;
      } catch {
        console.error(JSON.stringify({ event: "invalid_backup_manifest" }));
      }
    }
    await metrics(
      new PutMetricDataCommand({
        Namespace: namespace,
        MetricData: [
          { MetricName: "BackupAgeSeconds", Value: age, Unit: "Seconds" },
        ],
      }),
    );
    return { age };
  };
}
const storage = new S3Client({});
const cloudwatch = new CloudWatchClient({});
export const handler = makeMonitor({
  s3: (c) => storage.send(c),
  metrics: (c) => cloudwatch.send(c),
  healthUrl: process.env.HEALTH_URL,
  bucket: process.env.BACKUP_BUCKET,
  prefix: process.env.BACKUP_PREFIX,
  namespace: process.env.METRIC_NAMESPACE,
});
