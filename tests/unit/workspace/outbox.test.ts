import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus, type DeliveryReceipt } from "@server/lib/events";
import {
  deliverWorkspaceOutboxEvent,
  WorkspaceOutboxDispatcher,
} from "@services/workspace/outbox";
import {
  outboxRetryDelayMs,
  type ClaimedWorkspaceOutboxEvent,
  type WorkspaceOutboxStore,
} from "@services/workspace/outbox-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function event(
  overrides: Partial<ClaimedWorkspaceOutboxEvent> = {},
): ClaimedWorkspaceOutboxEvent {
  return {
    id: "op-1",
    eventType: "workspace.deleted",
    payload: { id: "ws-1" },
    attempts: 0,
    claimToken: "",
    ...overrides,
  };
}

/** Stateful port double. PostgreSQL predicates are exercised in the system tier. */
class MemoryStore implements WorkspaceOutboxStore {
  inspect = vi.fn(async () => ({
    pendingCount: 0,
    deadLetterCount: 0,
    oldestPendingAgeSeconds: 0,
    oldestPublishedAgeSeconds: 0,
  }));
  rows: (ClaimedWorkspaceOutboxEvent & {
    until: number;
    available: number;
    done: boolean;
    dead: boolean;
    published: boolean;
  })[];
  copyStatus = "copying";
  tokens = 0;
  constructor(events = [event()]) {
    this.rows = events.map((item) => ({
      ...item,
      until: 0,
      available: 0,
      done: false,
      dead: false,
      published: false,
    }));
  }
  claim = vi.fn(async () => {
    const row = this.rows.find(
      (item) =>
        !item.done &&
        !item.dead &&
        item.until <= Date.now() &&
        item.available <= Date.now(),
    );
    if (!row) return undefined;
    row.until = Date.now() + 60_000;
    row.claimToken = `token-${++this.tokens}`;
    row.attempts++;
    return { ...row };
  });
  private owned(claim: ClaimedWorkspaceOutboxEvent) {
    return this.rows.find(
      (row) =>
        row.id === claim.id &&
        row.claimToken === claim.claimToken &&
        row.until > Date.now() &&
        !row.done &&
        !row.dead,
    );
  }
  renew = vi.fn(async (claim: ClaimedWorkspaceOutboxEvent) => {
    const row = this.owned(claim);
    if (!row) return false;
    row.until = Date.now() + 60_000;
    return true;
  });
  settle = vi.fn(
    async (claim: ClaimedWorkspaceOutboxEvent, receipt: DeliveryReceipt) => {
      const row = this.owned(claim);
      if (!row) return false;
      row.published = true;
      row.done = receipt.status === "completed";
      row.until = 0;
      row.available = Date.now() + 10_000;
      if (row.done && row.eventType === "workspace.duplicated")
        this.copyStatus = "ready";
      return true;
    },
  );
  fail = vi.fn(async (claim: ClaimedWorkspaceOutboxEvent, _error: unknown) => {
    const row = this.owned(claim);
    if (!row) return false;
    row.dead = claim.attempts >= 12;
    row.until = 0;
    row.available = Date.now() + outboxRetryDelayMs(claim.attempts);
    if (row.dead && row.eventType === "workspace.duplicated")
      this.copyStatus = "failed";
    return true;
  });
}

afterEach(() => vi.useRealTimers());

describe("required outbox delivery", () => {
  it("does not acknowledge an empty bus or an ordinary notification listener", async () => {
    const bus = new EventBus();
    const observer = vi.fn();
    bus.on("workspace.deleted", observer);
    const store = new MemoryStore();
    await new WorkspaceOutboxDispatcher(store, bus).wake();
    expect(store.settle).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({ id: "op-1" }),
      expect.objectContaining({
        message: "Required handler unavailable: workspace.deleted",
      }),
    );
    expect(store.rows[0]).toMatchObject({ done: false, dead: false });
    expect(observer).not.toHaveBeenCalled();
  });

  it("rejects duplicate required owners", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.registerRequired("workspace.deleted", handler);
    expect(() => bus.registerRequired("workspace.deleted", handler)).toThrow(
      "already registered",
    );
  });

  it.each([
    event(),
    event({
      eventType: "workspaces.deleted",
      payload: { ids: ["one", "two"] },
    }),
    event({
      eventType: "workspace.duplicated",
      payload: { originalId: "one", newId: "two" },
    }),
  ])(
    "requires explicit completion for $eventType with a stable operation id",
    async (job) => {
      const bus = new EventBus();
      const handler = vi.fn(async (_payload, { operationId }) => ({
        operationId,
        status: "completed" as const,
      }));
      bus.registerRequired(job.eventType, handler);
      await expect(deliverWorkspaceOutboxEvent(job, bus)).resolves.toEqual({
        operationId: "op-1",
        status: "completed",
      });
      expect(handler).toHaveBeenCalledWith(job.payload, {
        operationId: job.id,
      });
    },
  );

  it.each([
    undefined,
    { operationId: "wrong", status: "completed" },
    { operationId: "op-1", status: "queued" },
  ])("rejects an invalid receipt: %j", async (receipt) => {
    const bus = new EventBus();
    bus.registerRequired(
      "workspace.deleted",
      vi.fn().mockResolvedValue(receipt),
    );
    await expect(deliverWorkspaceOutboxEvent(event(), bus)).rejects.toThrow(
      "Invalid delivery receipt",
    );
  });

  it.each([
    { eventType: "workspace.deleted" as const, payload: {} },
    { eventType: "workspaces.deleted" as const, payload: { ids: [3] } },
    { eventType: "workspace.duplicated" as const, payload: { newId: "dest" } },
  ])("never sends malformed $eventType work", async (invalid) => {
    const executeRequired = vi.fn();
    await expect(
      deliverWorkspaceOutboxEvent(event(invalid), { executeRequired }),
    ).rejects.toThrow("Invalid payload");
    expect(executeRequired).not.toHaveBeenCalled();
  });

  it("retains failing work for retry", async () => {
    const bus = new EventBus();
    bus.registerRequired("workspace.deleted", async () => {
      throw new Error("Dynamo unavailable");
    });
    const store = new MemoryStore();
    await new WorkspaceOutboxDispatcher(store, bus).wake();
    expect(store.settle).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledOnce();
    expect(store.rows[0].done).toBe(false);
  });

  it("does not mark a copy ready when a transport only confirms publication", async () => {
    const bus = new EventBus();
    bus.registerRequired(
      "workspace.duplicated",
      async (_payload, { operationId }) => ({
        operationId,
        status: "published",
      }),
    );
    const store = new MemoryStore([
      event({
        eventType: "workspace.duplicated",
        payload: { originalId: "a", newId: "b" },
      }),
    ]);
    await new WorkspaceOutboxDispatcher(store, bus).wake();
    expect(store.rows[0]).toMatchObject({ published: true, done: false });
    expect(store.copyStatus).toBe("copying");
  });

  it("bounds exponential retry delays", () => {
    expect([1, 3, 99].map(outboxRetryDelayMs)).toEqual([1_000, 4_000, 300_000]);
  });
});

describe("outbox worker ownership and lifecycle", () => {
  it("claims one job at a time and excludes a second worker while renewing", async () => {
    vi.useFakeTimers();
    const done = deferred<DeliveryReceipt>();
    const bus = new EventBus();
    bus.registerRequired("workspace.deleted", async () => done.promise);
    const store = new MemoryStore();
    const first = new WorkspaceOutboxDispatcher(store, bus);
    const firstRun = first.wake();
    await vi.advanceTimersByTimeAsync(80_000);
    expect(store.renew).toHaveBeenCalledTimes(4);
    await new WorkspaceOutboxDispatcher(store, bus).wake();
    expect(store.tokens).toBe(1);
    done.resolve({ operationId: "op-1", status: "completed" });
    await firstRun;
    expect(store.rows[0].done).toBe(true);
  });

  it("fences a delayed worker after expiry, reclaim, and newer completion", async () => {
    vi.useFakeTimers();
    const done = deferred<DeliveryReceipt>();
    const slowBus = new EventBus();
    slowBus.registerRequired("workspace.deleted", async () => done.promise);
    const store = new MemoryStore();
    // Simulate a paused process: no heartbeat until after its lease expires.
    const oldRun = new WorkspaceOutboxDispatcher(
      store,
      slowBus,
      120_000,
    ).wake();
    await vi.advanceTimersByTimeAsync(61_000);
    const newBus = new EventBus();
    newBus.registerRequired(
      "workspace.deleted",
      async (_payload, { operationId }) => ({
        operationId,
        status: "completed",
      }),
    );
    await new WorkspaceOutboxDispatcher(store, newBus).wake();
    expect(store.tokens).toBe(2);
    done.resolve({ operationId: "op-1", status: "completed" });
    await oldRun;
    expect(
      store.settle.mock.results.map((result) => result.value),
    ).toHaveLength(2);
    expect(await store.settle.mock.results[1].value).toBe(false);
    expect(store.rows[0]).toMatchObject({ done: true, attempts: 2 });
  });

  it.each([false, "throws"])(
    "skips settlement when lease renewal is %s",
    async (renewal) => {
      vi.useFakeTimers();
      const done = deferred<DeliveryReceipt>();
      const bus = new EventBus();
      bus.registerRequired("workspace.deleted", async () => done.promise);
      const store = new MemoryStore();
      if (renewal === false) store.renew.mockResolvedValue(false);
      else store.renew.mockRejectedValue(new Error("database offline"));
      const run = new WorkspaceOutboxDispatcher(store, bus).wake();
      await vi.advanceTimersByTimeAsync(20_000);
      done.resolve({ operationId: "op-1", status: "completed" });
      await run;
      expect(store.settle).not.toHaveBeenCalled();
      expect(store.fail).not.toHaveBeenCalled();
    },
  );

  it("replays the same operation after a crash between side effect and settlement", async () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const applied = new Set<string>();
    let sideEffects = 0;
    const handler = vi.fn(async (_payload, { operationId }) => {
      if (!applied.has(operationId)) {
        sideEffects++;
        applied.add(operationId);
      }
      return { operationId, status: "completed" as const };
    });
    bus.registerRequired("workspace.deleted", handler);
    const store = new MemoryStore();
    store.settle.mockRejectedValueOnce(
      new Error("connection lost after delivery"),
    );
    await new WorkspaceOutboxDispatcher(store, bus).wake();
    expect(store.fail).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(61_000);
    await new WorkspaceOutboxDispatcher(store, bus).wake();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(sideEffects).toBe(1);
    expect(handler.mock.calls.map((call) => call[1].operationId)).toEqual([
      "op-1",
      "op-1",
    ]);
    expect(store.rows[0].done).toBe(true);
  });

  it("dead-letters a final failure and does not redeliver an exhausted crash claim", async () => {
    const store = new MemoryStore([
      event({
        attempts: 12,
        eventType: "workspace.duplicated",
        payload: { originalId: "a", newId: "b" },
      }),
    ]);
    const executeRequired = vi.fn();
    await new WorkspaceOutboxDispatcher(store, { executeRequired }).wake();
    expect(executeRequired).not.toHaveBeenCalled();
    expect(store.rows[0]).toMatchObject({ dead: true, done: false });
    expect(store.copyStatus).toBe("failed");
  });

  it("drains active work before shutdown, keeps renewing, and stops taking claims", async () => {
    vi.useFakeTimers();
    const done = deferred<DeliveryReceipt>();
    const bus = new EventBus();
    bus.registerRequired("workspace.deleted", async () => done.promise);
    const store = new MemoryStore([event(), event({ id: "op-2" })]);
    const worker = new WorkspaceOutboxDispatcher(store, bus);
    worker.start();
    await vi.advanceTimersByTimeAsync(0);
    const stopped = vi.fn();
    const stop = worker.stop().then(stopped);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(stopped).not.toHaveBeenCalled();
    expect(store.renew).toHaveBeenCalledOnce();
    done.resolve({ operationId: "op-1", status: "completed" });
    await stop;
    await worker.wake();
    expect(store.claim).toHaveBeenCalledOnce();
    expect(store.rows[1].attempts).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
