import { vi } from "vitest";
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";

/** Deterministic port double, not a substitute for DynamoDB system verification. */
export class MemoryDynamo {
  items = new Map<string, Record<string, any>>();
  before?: (command: any) => Promise<void>;
  after?: (command: any) => Promise<void>;
  pageSize = Number.MAX_SAFE_INTEGER;
  batchFailures = 0;
  key(key: Record<string, any>) {
    return `${key.pk}|${key.sk}`;
  }
  conditional(transaction = false): never {
    throw Object.assign(new Error("conditional failure"), {
      name: transaction
        ? "TransactionCanceledException"
        : "ConditionalCheckFailedException",
      CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
    });
  }
  private check(input: any, transaction = false) {
    if (!input.ConditionExpression) return;
    const current = this.items.get(this.key(input.Key ?? input.Item));
    const expression = input.ConditionExpression as string;
    if (
      expression.includes("attribute_not_exists(#pk)") ||
      expression === "attribute_not_exists(pk)"
    ) {
      if (current) this.conditional(transaction);
    } else if (expression.includes("#token = :token")) {
      if (
        !current ||
        current.token !== input.ExpressionAttributeValues[":token"] ||
        current.deleted !== undefined
      )
        this.conditional(transaction);
    } else if (expression === "#status = :pending") {
      if (current?.status !== "pending") this.conditional(transaction);
    } else throw new Error(`Unimplemented test condition: ${expression}`);
  }
  send = vi.fn(async (command: any): Promise<any> => {
    await this.before?.(command);
    const input = command.input;
    let output: any = {};
    if (command instanceof GetCommand) {
      output = { Item: structuredClone(this.items.get(this.key(input.Key))) };
    } else if (command instanceof QueryCommand) {
      const pk = input.ExpressionAttributeValues[":pk"];
      const prefix = input.ExpressionAttributeValues[":prefix"];
      const rows = [...this.items.values()]
        .filter(
          (row) => row.pk === pk && (!prefix || row.sk.startsWith(prefix)),
        )
        .sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0));
      const start = input.ExclusiveStartKey
        ? rows.findIndex(
            (row) => this.key(row) === this.key(input.ExclusiveStartKey),
          ) + 1
        : 0;
      const page = rows.slice(start, start + this.pageSize);
      output = {
        Items: structuredClone(page),
        ...(start + page.length < rows.length
          ? { LastEvaluatedKey: { pk, sk: page.at(-1)!.sk } }
          : {}),
      };
    } else if (command instanceof PutCommand) {
      this.check(input);
      this.items.set(this.key(input.Item), structuredClone(input.Item));
    } else if (command instanceof DeleteCommand) {
      this.check(input);
      this.items.delete(this.key(input.Key));
    } else if (command instanceof TransactWriteCommand) {
      for (const operation of input.TransactItems)
        this.check(
          operation.ConditionCheck ?? operation.Put ?? operation.Update,
          true,
        );
      for (const operation of input.TransactItems) {
        if (operation.Put)
          this.items.set(
            this.key(operation.Put.Item),
            structuredClone(operation.Put.Item),
          );
        if (operation.Update) {
          const row = this.items.get(this.key(operation.Update.Key))!;
          row.status = "completed";
          delete row.pointer;
        }
      }
    } else if (command instanceof BatchWriteCommand) {
      const batches = input.RequestItems as Record<
        string,
        {
          DeleteRequest?: { Key: Record<string, unknown> };
          PutRequest?: { Item: Record<string, unknown> };
        }[]
      >;
      if (this.batchFailures-- > 0)
        output = { UnprocessedItems: input.RequestItems };
      else
        for (const requests of Object.values(batches)) {
          for (const request of requests) {
            if (request.DeleteRequest)
              this.items.delete(this.key(request.DeleteRequest.Key));
            if (request.PutRequest)
              this.items.set(
                this.key(request.PutRequest.Item),
                structuredClone(request.PutRequest.Item),
              );
          }
        }
    } else
      throw new Error(`Unexpected test command: ${command.constructor.name}`);
    await this.after?.(command);
    return output;
  });
}
