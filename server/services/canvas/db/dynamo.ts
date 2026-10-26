// One committed document head; immutable chunks are only used for large snapshots.
import {
  DynamoDBClient,
  DescribeTableCommand,
  CreateTableCommand,
  waitUntilTableExists,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AtomicCanvasStorage } from "./snapshots";
import { createChildLogger } from "@server/lib/logger";

export {
  CanvasDeletedError,
  CanvasRevisionConflictError,
  CanvasWriteIncompleteError,
  CanvasWriteLockedError,
} from "./errors";
export const partitionKey = (id: string) => `ws#${id}`;
const log = createChildLogger("dynamo-canvas");
const TABLE = process.env.CANVAS_DDB_TABLE || "meshwork-canvas";
const ENDPOINT = process.env.DYNAMODB_ENDPOINT;
const REGION = process.env.AWS_REGION || "us-east-1";
let cached: { client: DynamoDBClient; doc: DynamoDBDocumentClient } | undefined;
function clients() {
  if (!cached) {
    const client = new DynamoDBClient({
      endpoint: ENDPOINT,
      region: REGION,
      ...(ENDPOINT
        ? { credentials: { accessKeyId: "local", secretAccessKey: "local" } }
        : {}),
    });
    cached = { client, doc: DynamoDBDocumentClient.from(client) };
  }
  return cached;
}

export async function canvasTableReady(timeoutMs = 1500): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      clients().client.send(new DescribeTableCommand({ TableName: TABLE })),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return Boolean(result.Table);
  } catch (error) {
    if ((error as Error).name === "ResourceNotFoundException") return false;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureCanvasTable(): Promise<void> {
  const { client } = clients();
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE }));
    log.info(
      { table: TABLE, region: REGION },
      "DynamoDB canvas table verified",
    );
  } catch (error) {
    if ((error as Error).name !== "ResourceNotFoundException") {
      log.warn({ err: error, table: TABLE }, "DynamoDB describe table warning");
      return;
    }
    try {
      await client.send(
        new CreateTableCommand({
          TableName: TABLE,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          ...(ENDPOINT ? {} : { SSESpecification: { Enabled: true } }),
        }),
      );
      await waitUntilTableExists(
        { client, maxWaitTime: 30 },
        { TableName: TABLE },
      );
    } catch (createError) {
      log.error(
        { err: createError, table: TABLE },
        "Failed to auto-create DynamoDB canvas table",
      );
    }
  }
}

export class DynamoCanvasStorage extends AtomicCanvasStorage {
  constructor() {
    super(clients().doc, TABLE);
  }
}
