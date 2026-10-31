import { describe, expect, it, vi } from "vitest";
import { DeleteCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  AtomicCanvasStorage,
  type CanvasObjectStore,
} from "@services/canvas/db/snapshots";
import {
  CanvasDeletedError,
  CanvasInvalidGraphError,
  CanvasRevisionConflictError,
} from "@services/canvas/db/errors";
import { MemoryDynamo } from "../../helpers/memory-dynamo";

const node = (id: string) => ({
  id,
  position: { x: 0, y: 0 },
  data: { label: id },
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const db = new MemoryDynamo();
  const blobs = new Map<string, Uint8Array>();
  let counter = 0;
  const objects: CanvasObjectStore = {
    put: vi.fn(async (id, bytes) => {
      const key = `${id}/${++counter}`;
      blobs.set(key, new Uint8Array(bytes));
      return key;
    }),
    get: vi.fn(async (key) => {
      const bytes = blobs.get(key);
      if (!bytes) throw new Error("S3 object not found");
      return bytes;
    }),
    remove: vi.fn(async (key) => {
      blobs.delete(key);
    }),
    purge: vi.fn(async (id) => {
      for (const key of blobs.keys())
        if (key.startsWith(`${id}/`)) blobs.delete(key);
    }),
  };
  const store = new AtomicCanvasStorage(db, "test", {
    objects,
    useObjects: () => true,
    inlineLimit: () => 1,
  });
  return { db, blobs, objects, store };
}

describe("merged atomic and S3 canvas storage", () => {
  it("stores immutable S3 overflow, reads it back, and purges objects after deletion", async () => {
    const { store, db, blobs, objects } = fixture();
    await expect(store.syncCanvas("ws", [node("a")], [], 0)).resolves.toBe(1);
    expect(blobs.size).toBe(1);
    expect(db.items.get("ws#ws|doc")?.pointer).toMatchObject({
      objectKey: "ws/1",
    });
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [node("a")],
      edges: [],
      revision: 1,
    });
    await store.deleteWorkspaces(["ws"]);
    expect(objects.purge).toHaveBeenCalledWith("ws", true);
    expect(blobs.size).toBe(0);
    await expect(
      store.syncCanvas("ws", [node("b")], [], 0),
    ).rejects.toBeInstanceOf(CanvasDeletedError);
  });

  it("deletes a losing writer's unused S3 object after a conditional-write conflict", async () => {
    const { store, db, blobs, objects } = fixture();
    const block = deferred();
    const entered = deferred();
    db.before = async (command) => {
      if (
        command instanceof PutCommand &&
        command.input.Item?.pointer?.objectKey === "ws/1"
      ) {
        entered.resolve();
        await block.promise;
      }
    };
    const first = store.syncCanvas("ws", [node("a")], [], 0);
    await entered.promise;
    await expect(store.syncCanvas("ws", [node("b")], [], 0)).resolves.toBe(1);
    block.resolve();
    await expect(first).rejects.toBeInstanceOf(CanvasRevisionConflictError);
    expect(objects.remove).toHaveBeenCalledWith("ws/1");
    expect([...blobs.keys()]).toEqual(["ws/2"]);
    expect((await store.getCanvas("ws")).nodes).toEqual([node("b")]);
  });

  it("does not resurrect a workspace when an S3 upload finishes after deletion", async () => {
    const { store, objects, blobs } = fixture();
    const block = deferred();
    const entered = deferred();
    vi.mocked(objects.put).mockImplementationOnce(async (id, bytes) => {
      entered.resolve();
      await block.promise;
      const key = `${id}/late`;
      blobs.set(key, new Uint8Array(bytes));
      return key;
    });
    const save = store.syncCanvas("ws", [node("a")], [], 0);
    await entered.promise;
    await store.deleteWorkspaces(["ws"]);
    block.resolve();
    await expect(save).rejects.toBeInstanceOf(CanvasDeletedError);
    expect(blobs.size).toBe(0);
    expect((await store.getCanvas("ws")).nodes).toEqual([]);
  });

  it("retries S3 cleanup when deletion fails", async () => {
    const { store, objects, db } = fixture();
    await store.syncCanvas("ws", [node("a")], [], 0);
    vi.mocked(objects.purge).mockRejectedValueOnce(new Error("S3 unavailable"));
    await expect(store.deleteWorkspaces(["ws"])).rejects.toThrow(
      "S3 unavailable",
    );
    expect(db.items.get("ws#ws|doc")).toMatchObject({
      deleted: true,
      hadObjects: true,
    });
    await expect(store.deleteWorkspaces(["ws"])).resolves.toBeUndefined();
    expect(objects.purge).toHaveBeenLastCalledWith("ws", true);
  });

  it("does not require S3 for a small document when the bucket is unset", async () => {
    const { db, objects } = fixture();
    const store = new AtomicCanvasStorage(db, "test", {
      objects,
      useObjects: () => true,
      inlineLimit: () => 280 * 1024,
    });
    await store.syncCanvas("ws", [node("a")], [], 0);
    await store.deleteWorkspaces(["ws"]);
    expect(objects.put).not.toHaveBeenCalled();
    expect(objects.purge).toHaveBeenCalledWith("ws", false);
  });

  it("remembers old S3 objects when a later save fits inline or S3 mode is disabled", async () => {
    const { db, objects } = fixture();
    let s3Mode = true;
    const store = new AtomicCanvasStorage(db, "test", {
      objects,
      useObjects: () => s3Mode,
      inlineLimit: () => (s3Mode ? 1 : 280 * 1024),
    });
    await store.syncCanvas("ws", [node("a")], [], 0);
    s3Mode = false;
    await store.syncCanvas("ws", [node("b")], [], 1);
    expect(db.items.get("ws#ws|doc")).toMatchObject({ hadObjects: true });
    await store.deleteWorkspaces(["ws"]);
    expect(objects.purge).toHaveBeenCalledWith("ws", true);
  });

  it("copies once even when an outbox operation is replayed after a destination edit", async () => {
    const { store } = fixture();
    await store.syncCanvas("source", [node("a")], [], 0);
    await store.duplicateCanvas("source", "target", "copy-op");
    await store.syncCanvas("target", [node("edited")], [], 1);
    await store.duplicateCanvas("source", "target", "copy-op");
    expect(await store.getCanvas("target")).toEqual({
      nodes: [node("edited")],
      edges: [],
      revision: 2,
    });
  });
});

describe("merged delta and migration behavior", () => {
  it("applies deltas atomically, cascades deleted-node edges, and rejects stale revisions", async () => {
    const store = new AtomicCanvasStorage(new MemoryDynamo(), "test");
    await store.syncCanvas(
      "ws",
      [node("a"), node("b")],
      [{ id: "edge", source: "a", target: "b" }],
      0,
    );
    const next = await store.syncCanvasChanges(
      "ws",
      { deleteNodeIds: ["a"] },
      1,
    );
    expect(next).toEqual({ nodes: [node("b")], edges: [], revision: 2 });
    await expect(
      store.syncCanvasChanges("ws", { deleteNodeIds: ["b"] }, 1),
    ).rejects.toBeInstanceOf(CanvasRevisionConflictError);
    await expect(
      store.syncCanvasChanges(
        "ws",
        { upsertEdges: [{ id: "bad", source: "b", target: "missing" }] },
        2,
      ),
    ).rejects.toBeInstanceOf(CanvasInvalidGraphError);
    expect(await store.getCanvas("ws")).toEqual(next);
  });

  it("backfills legacy per-node data without changing its revision", async () => {
    const db = new MemoryDynamo();
    db.items.set("ws#ws|node#a", {
      pk: "ws#ws",
      sk: "node#a",
      body: { position: { x: 0, y: 0 }, data: { label: "a" } },
    });
    db.items.set("ws#ws|meta", { pk: "ws#ws", sk: "meta", revision: 7 });
    const store = new AtomicCanvasStorage(db, "test");
    await expect(store.backfillCanvas("ws")).resolves.toBe("created");
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [node("a")],
      edges: [],
      revision: 7,
    });
    await expect(store.backfillCanvas("ws")).resolves.toBe("exists");
    expect(db.items.has("ws#ws|node#a")).toBe(true);
  });

  it("restores a verified legacy copy at the same revision while keeping S3 objects recoverable", async () => {
    const { store, db, blobs } = fixture();
    await store.syncCanvas(
      "ws",
      [node("a"), node("b")],
      [{ id: "edge", source: "a", target: "b" }],
      0,
    );
    await expect(store.restoreLegacyFromDoc("ws")).resolves.toBe("restored");
    expect(db.items.has("ws#ws|doc")).toBe(false);
    expect(db.items.get("ws#ws|meta")?.revision).toBe(1);
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [node("a"), node("b")],
      edges: [{ id: "edge", source: "a", target: "b" }],
      revision: 1,
    });
    expect(blobs.size).toBe(1);
  });

  it("keeps the atomic document authoritative if a legacy restore cannot finish", async () => {
    const db = new MemoryDynamo();
    const store = new AtomicCanvasStorage(db, "test");
    await store.syncCanvas("ws", [node("a")], [], 0);
    db.batchFailures = 6;
    await expect(store.restoreLegacyFromDoc("ws")).rejects.toThrow();
    expect(db.items.get("ws#ws|doc")).toMatchObject({ format: 2, revision: 1 });
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [node("a")],
      edges: [],
      revision: 1,
    });
  });

  it("does not remove a newer atomic head if a writer races an offline restore", async () => {
    const db = new MemoryDynamo();
    const store = new AtomicCanvasStorage(db, "test");
    await store.syncCanvas("ws", [node("a")], [], 0);
    const block = deferred();
    const entered = deferred();
    db.before = async (command) => {
      if (command instanceof DeleteCommand && command.input.Key?.sk === "doc") {
        entered.resolve();
        await block.promise;
      }
    };
    const restore = store.restoreLegacyFromDoc("ws");
    await entered.promise;
    await store.syncCanvas("ws", [node("new")], [], 1);
    block.resolve();
    await expect(restore).rejects.toBeInstanceOf(CanvasRevisionConflictError);
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [node("new")],
      edges: [],
      revision: 2,
    });
  });

  it("fails closed on an unexpected old document item instead of reading it as empty", async () => {
    const db = new MemoryDynamo();
    db.items.set("ws#ws|doc", {
      pk: "ws#ws",
      sk: "doc",
      revision: 2,
      s3Key: "old/key",
    });
    const store = new AtomicCanvasStorage(db, "test");
    await expect(store.getCanvas("ws")).rejects.toMatchObject({
      code: "CANVAS_DOC_CONFIG",
    });
    await expect(
      store.syncCanvas("ws", [node("a")], [], 2),
    ).rejects.toMatchObject({ code: "CANVAS_DOC_CONFIG" });
    expect(db.items.get("ws#ws|doc")).toMatchObject({
      revision: 2,
      s3Key: "old/key",
    });
  });
});
