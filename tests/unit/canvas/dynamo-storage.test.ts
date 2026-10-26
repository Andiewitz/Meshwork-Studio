import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { AtomicCanvasStorage } from "@services/canvas/db/snapshots";
import {
  CanvasDeletedError,
  CanvasRevisionConflictError,
} from "@services/canvas/db/errors";
import { MemoryDynamo } from "../../helpers/memory-dynamo";

const node = (id: string, label = id) => ({
  id,
  position: { x: 0, y: 0 },
  data: { label },
});
const largeNode = () => node("large", randomBytes(340_000).toString("base64"));
const fixture = () => {
  const db = new MemoryDynamo();
  return { db, store: new AtomicCanvasStorage(db, "test") };
};
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
const isPublish = (command: any) =>
  command instanceof PutCommand &&
  command.input.Item?.sk === "doc" &&
  !command.input.Item.deleted;
const isCopyCommit = (command: any) =>
  command instanceof TransactWriteCommand &&
  command.input.TransactItems?.some((op) => op.Update);

describe("atomic Canvas snapshots", () => {
  it("publishes the same public nodes/edges/revision shape and reads a small canvas in one GetItem", async () => {
    const { db, store } = fixture();
    expect(
      await store.syncCanvas(
        "ws",
        [node("b"), { ...node("a"), workspaceId: "ignored" }],
        [{ id: "edge", source: "a", target: "b" }],
        0,
      ),
    ).toBe(1);
    db.send.mockClear();
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [node("a"), node("b")],
      edges: [{ id: "edge", source: "a", target: "b" }],
      revision: 1,
    });
    expect(db.send).toHaveBeenCalledOnce();
    expect(db.send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
  });

  it("reads paginated legacy data, then lazily migrates without changing its revision", async () => {
    const { db, store } = fixture();
    db.pageSize = 1;
    db.items.set("ws#ws|node#a", {
      pk: "ws#ws",
      sk: "node#a",
      body: { position: { x: 0, y: 0 }, data: { label: "old" } },
    });
    db.items.set("ws#ws|meta", { pk: "ws#ws", sk: "meta", revision: 7 });
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [node("a", "old")],
      edges: [],
      revision: 7,
    });
    expect(await store.syncCanvas("ws", [node("a", "new")], [], 7)).toBe(8);
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [node("a", "new")],
      edges: [],
      revision: 8,
    });
    expect(db.items.has("ws#ws|node#a")).toBe(false);
  });

  it("rejects stale revisions before staging any payload", async () => {
    const { db, store } = fixture();
    await store.syncCanvas("ws", [node("a")], [], 0);
    db.send.mockClear();
    await expect(
      store.syncCanvas("ws", [node("b")], [], 0),
    ).rejects.toBeInstanceOf(CanvasRevisionConflictError);
    expect(
      db.send.mock.calls.every(([command]) => command instanceof GetCommand),
    ).toBe(true);
    expect((await store.getCanvas("ws")).nodes).toEqual([node("a")]);
  });

  it("keeps the previous complete revision visible if publication fails", async () => {
    const { db, store } = fixture();
    await store.syncCanvas("ws", [node("a")], [], 0);
    db.before = async (command) => {
      if (isPublish(command)) throw new Error("storage offline");
    };
    await expect(store.syncCanvas("ws", [largeNode()], [], 1)).rejects.toThrow(
      "storage offline",
    );
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [node("a")],
      edges: [],
      revision: 1,
    });
    db.before = undefined;
    await store.syncCanvas("ws", [node("c")], [], 1);
    expect((await store.getCanvas("ws")).nodes).toEqual([node("c")]);
  });

  it("keeps a large snapshot and its revision together across paginated chunk reads", async () => {
    const { db, store } = fixture();
    const large = largeNode();
    db.pageSize = 1;
    await store.syncCanvas(
      "ws",
      [large],
      [{ id: "self", source: "large", target: "large" }],
      0,
    );
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [large],
      edges: [{ id: "self", source: "large", target: "large" }],
      revision: 1,
    });
  });

  it("retries a read if a concurrent publication retires its old chunks", async () => {
    const { db, store } = fixture();
    await store.syncCanvas("ws", [largeNode()], [], 0);
    const entered = gate(),
      resume = gate();
    let paused = false;
    db.before = async (command) => {
      if (
        !paused &&
        command instanceof QueryCommand &&
        command.input.ExpressionAttributeValues?.[":prefix"]
      ) {
        paused = true;
        entered.release();
        await resume.promise;
      }
    };
    const read = store.getCanvas("ws");
    await entered.promise;
    await store.syncCanvas("ws", [node("new")], [], 1);
    resume.release();
    expect(await read).toEqual({
      nodes: [node("new")],
      edges: [],
      revision: 2,
    });
  });

  it("fences a paused old save after another writer publishes", async () => {
    const { db, store } = fixture();
    await store.syncCanvas("ws", [node("a")], [], 0);
    const entered = gate(),
      resume = gate();
    let paused = false;
    db.before = async (command) => {
      if (!paused && isPublish(command)) {
        paused = true;
        entered.release();
        await resume.promise;
      }
    };
    const old = store.syncCanvas("ws", [node("old")], [], 1);
    const rejected = expect(old).rejects.toBeInstanceOf(
      CanvasRevisionConflictError,
    );
    await entered.promise;
    await store.syncCanvas("ws", [node("winner")], [], 1);
    resume.release();
    await rejected;
    expect(await store.getCanvas("ws")).toEqual({
      nodes: [node("winner")],
      edges: [],
      revision: 2,
    });
  });

  it("does not expose a pointer whose immutable payload is incomplete", async () => {
    const { db, store } = fixture();
    await store.syncCanvas("ws", [largeNode()], [], 0);
    const chunk = [...db.items.keys()].find((key) =>
      key.includes("snapshot#"),
    )!;
    db.items.delete(chunk);
    await expect(store.getCanvas("ws")).rejects.toMatchObject({
      code: "CANVAS_WRITE_INCOMPLETE",
    });
  });
});

describe("copy replay and deletion fencing", () => {
  it("retains a pinned overflow copy even if the source is later deleted", async () => {
    const { db, store } = fixture();
    const large = largeNode();
    await store.syncCanvas("src", [large], [], 0);
    db.before = async (command) => {
      if (isCopyCommit(command)) throw new Error("interrupted after pin");
    };
    await expect(
      store.duplicateCanvas("src", "dest", "large-op"),
    ).rejects.toThrow("after pin");
    await store.deleteWorkspaces(["src"]);
    db.before = undefined;
    await store.duplicateCanvas("src", "dest", "large-op");
    expect(await store.getCanvas("dest")).toEqual({
      nodes: [large],
      edges: [],
      revision: 1,
    });
  });

  it("does not expose partial multi-transaction copy staging", async () => {
    const { db, store } = fixture();
    const large = node("huge", randomBytes(3_000_000).toString("base64"));
    await store.syncCanvas("src", [large], [], 0);
    let stages = 0;
    db.before = async (command) => {
      if (
        command instanceof TransactWriteCommand &&
        command.input.TransactItems?.some(
          (operation) => operation.Put?.Item?.chunk,
        )
      ) {
        if (++stages === 2) throw new Error("second chunk transaction failed");
      }
    };
    await expect(
      store.duplicateCanvas("src", "dest", "multi-op"),
    ).rejects.toThrow("second chunk");
    expect(await store.getCanvas("dest")).toEqual({
      nodes: [],
      edges: [],
      revision: 0,
    });
    db.before = undefined;
    await store.syncCanvas("src", [node("new-source")], [], 1);
    await store.duplicateCanvas("src", "dest", "multi-op");
    expect(await store.getCanvas("dest")).toEqual({
      nodes: [node("new-source")],
      edges: [],
      revision: 1,
    });
  });

  it("pins a source revision before copy completion; retry replaces the whole destination", async () => {
    const { db, store } = fixture();
    await store.syncCanvas("src", [node("old")], [], 0);
    await store.syncCanvas("dest", [node("remnant")], [], 0);
    db.before = async (command) => {
      if (isCopyCommit(command)) throw new Error("copy interrupted");
    };
    await expect(store.duplicateCanvas("src", "dest", "op")).rejects.toThrow(
      "copy interrupted",
    );
    expect((await store.getCanvas("dest")).nodes).toEqual([node("remnant")]);
    await store.syncCanvas("src", [node("changed-source")], [], 1);
    db.before = undefined;
    await store.duplicateCanvas("src", "dest", "op");
    expect(await store.getCanvas("dest")).toEqual({
      nodes: [node("old")],
      edges: [],
      revision: 2,
    });
  });

  it("does not repeat a completed copy after destination edits", async () => {
    const { store } = fixture();
    await store.syncCanvas("src", [node("source")], [], 0);
    await store.duplicateCanvas("src", "dest", "op");
    await store.syncCanvas("dest", [node("edited")], [], 1);
    await store.duplicateCanvas("src", "dest", "op");
    expect(await store.getCanvas("dest")).toEqual({
      nodes: [node("edited")],
      edges: [],
      revision: 2,
    });
  });

  it("does not overwrite an edit made after a pending copy pinned its destination", async () => {
    const { db, store } = fixture();
    await store.syncCanvas("src", [node("source")], [], 0);
    db.before = async (command) => {
      if (isCopyCommit(command)) throw new Error("interrupted");
    };
    await expect(store.duplicateCanvas("src", "dest", "op")).rejects.toThrow(
      "interrupted",
    );
    db.before = undefined;
    await store.syncCanvas("dest", [node("edited")], [], 0);
    await expect(
      store.duplicateCanvas("src", "dest", "op"),
    ).rejects.toBeInstanceOf(CanvasRevisionConflictError);
    expect((await store.getCanvas("dest")).nodes).toEqual([node("edited")]);
  });

  it("deduplicates simultaneous deliveries of one operation", async () => {
    const { store } = fixture();
    await store.syncCanvas("src", [node("source")], [], 0);
    await Promise.all([
      store.duplicateCanvas("src", "dest", "op"),
      store.duplicateCanvas("src", "dest", "op"),
    ]);
    expect((await store.getCanvas("dest")).revision).toBe(1);
  });

  it("recognizes a completion after an ambiguous committed transaction", async () => {
    const { db, store } = fixture();
    await store.syncCanvas("src", [node("source")], [], 0);
    db.after = async (command) => {
      if (isCopyCommit(command)) throw new Error("response lost after commit");
    };
    await expect(store.duplicateCanvas("src", "dest", "op")).rejects.toThrow(
      "response lost",
    );
    db.after = undefined;
    await store.syncCanvas("dest", [node("edited")], [], 1);
    await store.duplicateCanvas("src", "dest", "op");
    expect((await store.getCanvas("dest")).nodes).toEqual([node("edited")]);
  });

  it.each([false, true])(
    "permanently fences a paused %s save after deletion",
    async (large) => {
      const { db, store } = fixture();
      await store.syncCanvas("ws", [node("a")], [], 0);
      const entered = gate(),
        resume = gate();
      let paused = false;
      db.before = async (command) => {
        const staging =
          command instanceof TransactWriteCommand &&
          command.input.TransactItems?.some((op) => op.Put?.Item?.chunk);
        if (!paused && (large ? staging : isPublish(command))) {
          paused = true;
          entered.release();
          await resume.promise;
        }
      };
      const write = store.syncCanvas(
        "ws",
        [large ? largeNode() : node("delayed")],
        [],
        1,
      );
      const rejected = expect(write).rejects.toBeInstanceOf(CanvasDeletedError);
      await entered.promise;
      await store.deleteWorkspaces(["ws"]);
      resume.release();
      await rejected;
      expect(await store.getCanvas("ws")).toEqual({
        nodes: [],
        edges: [],
        revision: 0,
      });
      expect(
        [...db.items.keys()].filter((key) => key.startsWith("ws#ws|")),
      ).toEqual(["ws#ws|doc"]);
      await expect(store.syncCanvas("ws", [], [], 0)).rejects.toBeInstanceOf(
        CanvasDeletedError,
      );
    },
  );

  it("fences a pending copy after destination deletion", async () => {
    const { db, store } = fixture();
    await store.syncCanvas("src", [node("a")], [], 0);
    const entered = gate(),
      resume = gate();
    let paused = false;
    db.before = async (command) => {
      if (!paused && isCopyCommit(command)) {
        paused = true;
        entered.release();
        await resume.promise;
      }
    };
    const copy = store.duplicateCanvas("src", "dest", "op");
    const rejected = expect(copy).rejects.toBeInstanceOf(CanvasDeletedError);
    await entered.promise;
    await store.deleteWorkspaces(["dest"]);
    resume.release();
    await rejected;
    expect((await store.getCanvas("dest")).nodes).toEqual([]);
    expect(db.items.get("ws#dest|doc")).toMatchObject({ deleted: true });
  });

  it("retries incomplete deletion without ever removing the tombstone", async () => {
    const { db, store } = fixture();
    await store.syncCanvas("ws", [largeNode()], [], 0);
    db.batchFailures = 6;
    await expect(store.deleteWorkspaces(["ws"])).rejects.toMatchObject({
      code: "CANVAS_WRITE_INCOMPLETE",
    });
    expect((await store.getCanvas("ws")).nodes).toEqual([]);
    await expect(
      store.syncCanvas("ws", [node("late")], [], 0),
    ).rejects.toBeInstanceOf(CanvasDeletedError);
    await store.deleteWorkspaces(["ws"]);
    expect([...db.items.keys()]).toEqual(["ws#ws|doc"]);
  });
});
