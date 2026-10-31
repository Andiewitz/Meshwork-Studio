import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  buildClient,
  CommitmentPolicy,
  KmsKeyringNode,
} from "@aws-crypto/client-node";
import { recipientKey, template, validateJob } from "./mail.mjs";

export function makeWorker({
  db,
  deliver,
  decryptCode,
  table,
  pool,
  from,
  configurationSet,
  dailyLimit = 200,
  now = Date.now,
}) {
  return async (event) => {
    const failures = [];
    for (const record of event.Records) {
      let owner;
      let job;
      const seconds = Math.floor(now() / 1000);
      try {
        job = validateJob(JSON.parse(record.body));
        if (job.pool !== pool) throw new Error("Unexpected user pool");
        if (job.notAfter <= seconds) continue;
        const saved = await db(
          new GetCommand({
            TableName: table,
            Key: { pk: `mail#${job.id}` },
            ConsistentRead: true,
          }),
        );
        if (saved.Item?.status === "SENT") continue;
        const suppressed = await db(
          new GetCommand({
            TableName: table,
            Key: { pk: `suppress#${recipientKey(job.to)}` },
            ConsistentRead: true,
          }),
        );
        if (suppressed.Item) continue;
        owner = randomUUID();
        await db(
          new UpdateCommand({
            TableName: table,
            Key: { pk: `mail#${job.id}` },
            UpdateExpression:
              "SET #s = :processing, leaseUntil = :lease, #o = :owner, expiresAt = :ttl",
            ConditionExpression:
              "attribute_not_exists(pk) OR (#s <> :sent AND leaseUntil < :now)",
            ExpressionAttributeNames: { "#s": "status", "#o": "owner" },
            ExpressionAttributeValues: {
              ":processing": "PROCESSING",
              ":sent": "SENT",
              ":lease": seconds + 120,
              ":owner": owner,
              ":ttl": seconds + 172800,
              ":now": seconds,
            },
          }),
        );
        // Counts attempts conservatively, including retries. Daily cap is shared across workers.
        await db(
          new UpdateCommand({
            TableName: table,
            Key: { pk: `budget#${new Date(now()).toISOString().slice(0, 10)}` },
            UpdateExpression: "SET expiresAt = :ttl ADD attempts :one",
            ConditionExpression:
              "attribute_not_exists(attempts) OR attempts < :limit",
            ExpressionAttributeValues: {
              ":ttl": seconds + 172800,
              ":one": 1,
              ":limit": dailyLimit,
            },
          }),
        );
        const code = job.code ? await decryptCode(job.code, pool) : "";
        const message = template(job.source, code);
        await deliver(
          new SendEmailCommand({
            FromEmailAddress: from,
            Destination: { ToAddresses: [job.to] },
            ConfigurationSetName: configurationSet,
            Content: {
              Simple: {
                Subject: { Data: message.subject, Charset: "UTF-8" },
                Body: { Text: { Data: message.text, Charset: "UTF-8" } },
              },
            },
          }),
        );
        await db(
          new UpdateCommand({
            TableName: table,
            Key: { pk: `mail#${job.id}` },
            UpdateExpression: "SET #s = :sent",
            ConditionExpression: "#o = :owner",
            ExpressionAttributeNames: { "#s": "status", "#o": "owner" },
            ExpressionAttributeValues: { ":sent": "SENT", ":owner": owner },
          }),
        );
      } catch (error) {
        // A failed lock acquisition must never release another invocation's lease.
        if (owner && job) {
          try {
            await db(
              new DeleteCommand({
                TableName: table,
                Key: { pk: `mail#${job.id}` },
                ConditionExpression: "#o = :owner AND #s <> :sent",
                ExpressionAttributeNames: { "#o": "owner", "#s": "status" },
                ExpressionAttributeValues: { ":owner": owner, ":sent": "SENT" },
              }),
            );
          } catch {
            /* lease expires */
          }
        }
        console.error(
          JSON.stringify({
            event: "email_job_failed",
            jobId: job?.id,
            errorType: error.name,
          }),
        );
        failures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures: failures };
  };
}
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESv2Client({});
const crypto = buildClient(CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT);
export const handler = makeWorker({
  db: (c) => doc.send(c),
  deliver: (c) => ses.send(c),
  table: process.env.TABLE_NAME,
  pool: process.env.POOL_ID,
  from: process.env.EMAIL_FROM,
  configurationSet: process.env.SES_CONFIGURATION_SET,
  dailyLimit: Number(process.env.DAILY_EMAIL_LIMIT || 200),
  decryptCode: async (code, pool) => {
    const keyring = new KmsKeyringNode({ keyIds: [process.env.KEY_ARN] });
    const { plaintext, messageHeader } = await crypto.decrypt(
      keyring,
      Buffer.from(code, "base64"),
    );
    if (messageHeader.encryptionContext["userpool-id"] !== pool)
      throw new Error("Wrong encryption context");
    return Buffer.from(plaintext).toString("utf8");
  },
});
