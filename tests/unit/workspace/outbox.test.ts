import { describe, expect, it, vi } from "vitest";
import {
  deliverWorkspaceOutboxEvents,
  outboxRetryDelayMs,
} from "@services/workspace/outbox";

describe("workspace outbox delivery", () => {
  it("delivers committed cleanup events and acknowledges them", async () => {
    const emitAsync = vi.fn().mockResolvedValue(undefined);
    const markProcessed = vi.fn().mockResolvedValue(undefined);
    const markFailed = vi.fn().mockResolvedValue(undefined);

    await deliverWorkspaceOutboxEvents(
      [
        {
          id: "event-1",
          eventType: "workspace.deleted",
          payload: { id: "workspace-1" },
          attempts: 1,
        },
        {
          id: "event-2",
          eventType: "workspaces.deleted",
          payload: { ids: ["workspace-2", "workspace-3"] },
          attempts: 1,
        },
      ],
      { emitAsync },
      markProcessed,
      markFailed,
    );

    expect(emitAsync).toHaveBeenNthCalledWith(1, "workspace.deleted", {
      id: "workspace-1",
    });
    expect(emitAsync).toHaveBeenNthCalledWith(2, "workspaces.deleted", {
      ids: ["workspace-2", "workspace-3"],
    });
    expect(markProcessed).toHaveBeenCalledTimes(2);
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("records a failure instead of acknowledging an event whose handler fails", async () => {
    const failure = new Error("DynamoDB unavailable");
    const emitAsync = vi.fn().mockRejectedValue(failure);
    const markProcessed = vi.fn().mockResolvedValue(undefined);
    const markFailed = vi.fn().mockResolvedValue(undefined);
    const event = {
      id: "event-1",
      eventType: "workspace.deleted" as const,
      payload: { id: "workspace-1" },
      attempts: 3,
    };

    await deliverWorkspaceOutboxEvents(
      [event],
      { emitAsync },
      markProcessed,
      markFailed,
    );

    expect(markProcessed).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(event, failure);
  });

  it("uses bounded exponential retries", () => {
    expect(outboxRetryDelayMs(1)).toBe(1_000);
    expect(outboxRetryDelayMs(3)).toBe(4_000);
    expect(outboxRetryDelayMs(99)).toBe(5 * 60_000);
  });
});
