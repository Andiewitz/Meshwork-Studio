import { z } from "zod";

export const wireTimestampSchema = z.string().datetime({ offset: true });
const id = z.string().min(1);
export const actorContextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), userId: id }).strict(),
  z.object({ kind: z.literal("system"), service: id }).strict(),
]);
export type ActorContext = z.infer<typeof actorContextSchema>;

export const eventPayloadSchemas = {
  "workspace.deleted": z.object({ id }).strict(),
  "workspace.duplicated": z.object({ originalId: id, newId: id }).strict(),
  "user.deleted": z.object({ id }).strict(),
  "workspaces.deleted": z.object({ ids: z.array(id) }).strict(),
  "account.cleanup.workspace": z.object({ userId: id.max(128) }).strict(),
  "account.cleanup.team": z.object({ userId: id.max(128) }).strict(),
  "account.cleanup.ai": z.object({ userId: id.max(128) }).strict(),
};
export type AppEvents = {
  [K in keyof typeof eventPayloadSchemas]: z.infer<
    (typeof eventPayloadSchemas)[K]
  >;
};
export type RequiredWorkspaceEvent = Exclude<keyof AppEvents, "user.deleted">;

export const commandContextSchema = z
  .object({
    operationId: id,
    requestId: id.optional(),
    actor: actorContextSchema.optional(),
  })
  .strict();
export type CommandContext = z.infer<typeof commandContextSchema>;

const metadata = {
  version: z.literal(1),
  operationId: id,
  // Transport publication time; operationId, not sentAt, identifies retries.
  sentAt: wireTimestampSchema,
  requestId: id.optional(),
  actor: actorContextSchema.optional(),
};
export const eventEnvelopeSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...metadata,
      type: z.literal("workspace.deleted"),
      payload: eventPayloadSchemas["workspace.deleted"],
    })
    .strict(),
  z
    .object({
      ...metadata,
      type: z.literal("workspace.duplicated"),
      payload: eventPayloadSchemas["workspace.duplicated"],
    })
    .strict(),
  z
    .object({
      ...metadata,
      type: z.literal("workspaces.deleted"),
      payload: eventPayloadSchemas["workspaces.deleted"],
    })
    .strict(),
  z
    .object({
      ...metadata,
      type: z.literal("account.cleanup.workspace"),
      payload: eventPayloadSchemas["account.cleanup.workspace"],
    })
    .strict(),
  z
    .object({
      ...metadata,
      type: z.literal("account.cleanup.team"),
      payload: eventPayloadSchemas["account.cleanup.team"],
    })
    .strict(),
  z
    .object({
      ...metadata,
      type: z.literal("account.cleanup.ai"),
      payload: eventPayloadSchemas["account.cleanup.ai"],
    })
    .strict(),
  z
    .object({
      ...metadata,
      type: z.literal("user.deleted"),
      payload: eventPayloadSchemas["user.deleted"],
    })
    .strict(),
]);
export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
export type CommandEnvelope = Exclude<EventEnvelope, { type: "user.deleted" }>;

export class ContractValidationError extends Error {
  constructor(
    readonly code: "CONTRACT_INVALID" | "CONTRACT_VERSION_UNSUPPORTED",
  ) {
    super(
      code === "CONTRACT_VERSION_UNSUPPORTED"
        ? "Unsupported event contract version"
        : "Invalid event contract",
    );
    this.name = "ContractValidationError";
  }
}

export function parseEventEnvelope(input: unknown): EventEnvelope {
  if (
    typeof input === "object" &&
    input !== null &&
    "version" in input &&
    input.version !== 1
  ) {
    throw new ContractValidationError("CONTRACT_VERSION_UNSUPPORTED");
  }
  const result = eventEnvelopeSchema.safeParse(input);
  if (!result.success) throw new ContractValidationError("CONTRACT_INVALID");
  return result.data;
}

export const deliveryReceiptSchema = z
  .object({
    operationId: id,
    status: z.enum(["published", "completed"]),
  })
  .strict();
export type DeliveryReceipt = z.infer<typeof deliveryReceiptSchema>;

export function parseEventPayload<K extends keyof AppEvents>(
  type: K,
  payload: unknown,
): AppEvents[K] {
  return eventPayloadSchemas[type].parse(payload) as AppEvents[K];
}

export function createEventEnvelope<K extends keyof AppEvents>(
  type: K,
  payload: AppEvents[K],
  context: CommandContext,
  sentAt = new Date().toISOString(),
): EventEnvelope {
  const metadata = commandContextSchema.safeParse(context);
  if (!metadata.success) throw new ContractValidationError("CONTRACT_INVALID");
  return parseEventEnvelope({
    ...metadata.data,
    version: 1,
    sentAt,
    type,
    payload,
  });
}
