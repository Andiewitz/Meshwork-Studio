import test from "node:test";
import assert from "node:assert/strict";
import { makeIntake } from "../src/intake.mjs";
import { makeWorker } from "../src/worker.mjs";
import { makeFeedback } from "../src/feedback.mjs";
import { makeMonitor } from "../src/monitor.mjs";
import { recipientKey, template } from "../src/mail.mjs";

const instant = Date.parse("2026-10-26T12:00:00Z");
const now = () => instant;
const source = {
  userPoolId: "pool",
  userName: "subject",
  triggerSource: "CustomEmailSender_SignUp",
  request: { userAttributes: { email: "user@example.com" }, code: "encrypted" },
};
async function job() {
  let value;
  await makeIntake({
    send: async (c) => {
      value = JSON.parse(c.input.MessageBody);
    },
    queueUrl: "queue",
    now,
  })(source);
  return value;
}
const records = (value) => ({
  Records: [{ messageId: "one", body: JSON.stringify(value) }],
});

function worker(overrides = {}) {
  const calls = [];
  const sent = [];
  const state = new Map();
  const db = async (command) => {
    calls.push(command);
    const { Key, ExpressionAttributeValues: values } = command.input;
    if (command.constructor.name === "GetCommand")
      return { Item: state.get(Key.pk) };
    if (command.constructor.name === "UpdateCommand" && values?.[":processing"])
      state.set(Key.pk, { status: "PROCESSING" });
    if (
      command.constructor.name === "UpdateCommand" &&
      command.input.UpdateExpression === "SET #s = :sent"
    )
      state.set(Key.pk, { status: "SENT" });
    return {};
  };
  return {
    calls,
    sent,
    state,
    handle: makeWorker({
      db,
      deliver: async (c) => sent.push(c.input),
      decryptCode: async () => "123456",
      table: "table",
      pool: "pool",
      from: "from@example.com",
      now,
      ...overrides,
    }),
  };
}

test("intake queues ciphertext with a stable retry ID and fails when SQS fails", async () => {
  const first = await job();
  assert.equal(first.id, (await job()).id);
  assert.equal(first.code, "encrypted");
  assert.equal(first.notAfter, instant / 1000 + 900);
  await assert.rejects(
    makeIntake({
      send: async () => {
        throw new Error("SQS unavailable");
      },
      queueUrl: "q",
      now,
    })(source),
  );
});
test("intake rejects unrecognized templates and malformed recipients", async () => {
  let sends = 0;
  const handle = makeIntake({ send: async () => sends++, queueUrl: "q", now });
  await assert.rejects(handle({ ...source, triggerSource: "unknown" }));
  await assert.rejects(
    handle({
      ...source,
      request: {
        ...source.request,
        userAttributes: { email: "bad\r\nBcc: target" },
      },
    }),
  );
  assert.equal(sends, 0);
});
test("worker sends the code and acknowledges a previously delivered retry", async () => {
  const w = worker();
  const value = await job();
  assert.deepEqual(await w.handle(records(value)), { batchItemFailures: [] });
  await w.handle(records(value));
  assert.equal(w.sent.length, 1);
  assert.match(w.sent[0].Content.Simple.Body.Text.Data, /123456/);
});
test("expired jobs and suppressed recipients never send", async () => {
  const w = worker();
  const value = await job();
  await w.handle(records({ ...value, notAfter: instant / 1000 }));
  w.state.set(`suppress#${recipientKey(value.to)}`, { reason: "Complaint" });
  await w.handle(records(value));
  assert.equal(w.sent.length, 0);
});
test("wrong pool and decryption failures return only failed batch IDs", async () => {
  const w = worker({
    decryptCode: async () => {
      throw new Error("bad ciphertext");
    },
  });
  const value = await job();
  assert.deepEqual(await w.handle(records(value)), {
    batchItemFailures: [{ itemIdentifier: "one" }],
  });
  assert.deepEqual(await w.handle(records({ ...value, pool: "attacker" })), {
    batchItemFailures: [{ itemIdentifier: "one" }],
  });
  assert.equal(w.sent.length, 0);
});
test("daily budget failure prevents SES delivery and retries the job", async () => {
  const w = worker({
    db: async (command) => {
      if (command.input.Key?.pk.startsWith("budget#"))
        throw Object.assign(new Error("quota"), {
          name: "ConditionalCheckFailedException",
        });
      return {};
    },
  });
  assert.equal(
    (await w.handle(records(await job()))).batchItemFailures.length,
    1,
  );
  assert.equal(w.sent.length, 0);
});
test("SES failure retries only that message", async () => {
  const w = worker({
    deliver: async () => {
      throw new Error("SES unavailable");
    },
  });
  assert.equal(
    (await w.handle(records(await job()))).batchItemFailures.length,
    1,
  );
});
test("temporary passwords are unescaped only in the email template", () => {
  assert.match(
    template("CustomEmailSender_AdminCreateUser", "&lt;&amp;&gt;").text,
    /<&>/,
  );
});
test("feedback suppresses permanent bounces, not transient ones, and rejects foreign topics", async () => {
  const written = [];
  const handle = makeFeedback({
    db: async (c) => written.push(c.input.Item),
    table: "t",
    topicArn: "expected",
  });
  const notification = (type) => ({
    Records: [
      {
        Sns: {
          TopicArn: "expected",
          Message: JSON.stringify({
            eventType: "Bounce",
            bounce: {
              bounceType: type,
              bouncedRecipients: [{ emailAddress: "user@example.com" }],
            },
          }),
        },
      },
    ],
  });
  await handle(notification("Transient"));
  await handle(notification("Permanent"));
  assert.equal(written.length, 1);
  assert.equal(written[0].pk, `suppress#${recipientKey("user@example.com")}`);
  await assert.rejects(handle({ Records: [{ Sns: { TopicArn: "foreign" } }] }));
});
test("health probe reports HTTP/DNS failure as a zero metric", async () => {
  const metrics = [];
  const handle = makeMonitor({
    s3: async () => ({}),
    metrics: async (c) => metrics.push(c.input),
    healthUrl: "https://example.com/ready",
    namespace: "test",
    now,
    fetcher: async () => {
      throw new Error("DNS failure");
    },
  });
  assert.deepEqual(await handle({ kind: "health" }), { available: 0 });
  assert.equal(metrics[0].MetricData[0].Value, 0);
});
test("backup monitor rejects missing or partial archives", async () => {
  const handle = makeMonitor({
    s3: async () => ({ Contents: [] }),
    metrics: async () => {},
    bucket: "b",
    prefix: "daily/",
    namespace: "test",
    now,
  });
  assert.deepEqual(await handle({ kind: "backup" }), { age: 259200 });
});
test("backup monitor verifies all archive objects before accepting the completion marker", async () => {
  const names = [
    "auth.dump",
    "workspace.dump",
    "team.dump",
    "jenkos.dump",
    "metrics.dump",
    "canvas.ndjson",
  ];
  let heads = 0;
  const handle = makeMonitor({
    metrics: async () => {},
    bucket: "b",
    prefix: "daily/",
    namespace: "test",
    now,
    s3: async (c) => {
      if (c.constructor.name === "ListObjectsV2Command")
        return {
          Contents: c.input.Prefix.endsWith("2026-10-26")
            ? [
                {
                  Key: "daily/2026-10-26T00-00-00/manifest.json",
                  LastModified: new Date(instant - 60000),
                },
              ]
            : [],
        };
      if (c.constructor.name === "GetObjectCommand")
        return {
          Body: {
            transformToString: async () =>
              JSON.stringify({
                version: 2,
                files: names.map((name) => ({
                  name,
                  bytes: 10,
                  sha256: "a".repeat(64),
                })),
              }),
          },
        };
      heads++;
      return { ContentLength: 10 };
    },
  });
  assert.deepEqual(await handle({ kind: "backup" }), { age: 60 });
  assert.equal(heads, 6);
});
