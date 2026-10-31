import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { recipientKey } from "./mail.mjs";
export function makeFeedback({ db, table, topicArn }) {
  return async (event) => {
    for (const record of event.Records) {
      if (record.Sns?.TopicArn !== topicArn)
        throw new Error("Unexpected notification topic");
      const message = JSON.parse(record.Sns.Message);
      const kind = message.notificationType ?? message.eventType;
      const recipients =
        kind === "Complaint"
          ? message.complaint?.complainedRecipients
          : kind === "Bounce" && message.bounce?.bounceType === "Permanent"
            ? message.bounce.bouncedRecipients
            : [];
      for (const recipient of recipients ?? []) {
        await db(
          new PutCommand({
            TableName: table,
            Item: {
              pk: `suppress#${recipientKey(recipient.emailAddress)}`,
              reason: kind,
            },
          }),
        );
      }
    }
  };
}
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const handler = makeFeedback({
  db: (c) => doc.send(c),
  table: process.env.TABLE_NAME,
  topicArn: process.env.FEEDBACK_TOPIC_ARN,
});
