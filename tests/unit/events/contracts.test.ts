import { describe, expect, it, vi } from "vitest";
import { EventBus } from "@server/lib/events";
import {
  createEventEnvelope,
  parseEventEnvelope,
  type AppEvents,
} from "@shared/contracts/events";

const context = {
  operationId: "stable-op",
  requestId: "request-1",
  actor: { kind: "system" as const, service: "workspace" },
};
const sentAt = "2026-10-26T08:00:00.000Z";

describe("versioned JSON event/command contracts", () => {
  it.each([
    ["workspace.deleted", { id: "workspace" }],
    ["workspace.duplicated", { originalId: "source", newId: "target" }],
    ["workspaces.deleted", { ids: ["one", "two"] }],
    ["user.deleted", { id: "user" }],
  ] as const)("round-trips %s without runtime objects", (type, payload) => {
    const envelope = createEventEnvelope(
      type,
      payload as AppEvents[typeof type],
      context,
      sentAt,
    );
    expect(parseEventEnvelope(JSON.parse(JSON.stringify(envelope)))).toEqual({
      version: 1,
      sentAt,
      type,
      payload,
      ...context,
    });
  });

  it("delivers a decoded command only after validating its envelope and preserving actor context", async () => {
    const bus = new EventBus();
    const handler = vi.fn(async () => ({
      operationId: "stable-op",
      status: "completed" as const,
    }));
    bus.registerRequired("workspace.deleted", handler);
    const wire = JSON.parse(
      JSON.stringify(
        createEventEnvelope("workspace.deleted", { id: "ws" }, context, sentAt),
      ),
    );
    expect(await bus.executeEnvelope(wire)).toEqual({
      operationId: "stable-op",
      status: "completed",
    });
    expect(handler).toHaveBeenCalledWith({ id: "ws" }, context);
  });

  it.each([0, 2, "1", null])(
    "rejects unsupported version %j before invoking a handler",
    async (version) => {
      const bus = new EventBus();
      const handler = vi.fn();
      bus.registerRequired("workspace.deleted", handler);
      await expect(
        bus.executeEnvelope({
          ...createEventEnvelope(
            "workspace.deleted",
            { id: "ws" },
            context,
            sentAt,
          ),
          version,
        }),
      ).rejects.toMatchObject({ code: "CONTRACT_VERSION_UNSUPPORTED" });
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each([
    new Date(sentAt),
    123,
    "yesterday",
    "2026-10-26",
    "2026-10-26T08:00:00",
  ])("rejects a non-wire timestamp %j", (invalid) => {
    expect(() =>
      parseEventEnvelope({
        ...createEventEnvelope(
          "workspace.deleted",
          { id: "ws" },
          context,
          sentAt,
        ),
        sentAt: invalid,
      }),
    ).toThrow("Invalid event contract");
  });

  it("accepts an explicit ISO offset and rejects an absent version", () => {
    const envelope = createEventEnvelope(
      "user.deleted",
      { id: "user" },
      context,
      "2026-10-26T16:00:00+08:00",
    );
    expect(parseEventEnvelope(envelope)).toEqual(envelope);
    const { version: _version, ...unversioned } = envelope;
    expect(() => parseEventEnvelope(unversioned)).toThrow(
      "Invalid event contract",
    );
  });

  it("blocks SQL handles and secret fields even through structurally assignable variables", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.registerRequired("workspace.deleted", handler);
    const payload = {
      id: "ws",
      tx: { execute: () => undefined },
      secret: "never-log-this",
    };
    await expect(
      bus.executeRequired("workspace.deleted", payload, context),
    ).rejects.toMatchObject({ code: "CONTRACT_INVALID" });
    expect(handler).not.toHaveBeenCalled();
    try {
      parseEventEnvelope({
        ...createEventEnvelope(
          "workspace.deleted",
          { id: "ws" },
          context,
          sentAt,
        ),
        token: "never-log-this",
      });
    } catch (error) {
      expect(String(error)).not.toContain("never-log-this");
    }
  });

  it("validates both legacy local notifications and versioned notifications", async () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on("user.deleted", handler);
    const payload = { id: "user", tx: {} };
    expect(() => bus.emit("user.deleted", payload)).toThrow();
    await expect(bus.emitAsync("user.deleted", payload)).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
    await bus.emitEnvelope(
      createEventEnvelope("user.deleted", { id: "user" }, context, sentAt),
    );
    expect(handler).toHaveBeenCalledWith({ id: "user" });
    await expect(
      bus.executeEnvelope(
        createEventEnvelope("user.deleted", { id: "user" }, context, sentAt),
      ),
    ).rejects.toThrow("Notification is not a required command");
  });

  it("returns a plain validated receipt, not an adapter class instance", async () => {
    class AdapterReceipt {
      operationId = "stable-op";
      status = "completed" as const;
      connection() {
        return "private adapter behavior";
      }
    }
    const bus = new EventBus();
    bus.registerRequired("workspace.deleted", async () => new AdapterReceipt());
    const receipt = await bus.executeRequired(
      "workspace.deleted",
      { id: "ws" },
      context,
    );
    expect(receipt).toEqual({ operationId: "stable-op", status: "completed" });
    expect(Object.getPrototypeOf(receipt)).toBe(Object.prototype);
    expect(receipt).not.toBeInstanceOf(AdapterReceipt);
  });

  it("rejects receipt metadata that could leak private adapter state", async () => {
    const bus = new EventBus();
    bus.registerRequired("workspace.deleted", async () => ({
      operationId: "stable-op",
      status: "completed",
      tx: {},
    }));
    await expect(
      bus.executeRequired("workspace.deleted", { id: "ws" }, context),
    ).rejects.toThrow("Invalid delivery receipt");
  });
});
