import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { hash, validateJob } from "./mail.mjs";
export function makeIntake({ send, queueUrl, now = Date.now }) {
  return async (event) => {
    const job = validateJob({
      version: 1,
      pool: event.userPoolId,
      source: event.triggerSource,
      to: event.request?.userAttributes?.email,
      code: event.request?.code,
      id: hash(
        JSON.stringify([
          event.userPoolId,
          event.userName,
          event.triggerSource,
          event.request?.code,
        ]),
      ),
      notAfter: Math.floor(now() / 1000) + 900,
    });
    await send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(job),
      }),
    );
    return event;
  };
}
const sqs = new SQSClient({});
export const handler = makeIntake({
  send: (command) => sqs.send(command),
  queueUrl: process.env.QUEUE_URL,
});
