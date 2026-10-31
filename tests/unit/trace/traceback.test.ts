import { describe, expect, it } from "vitest";
import pino from "pino";
import { errorTrace, logTraceback, wasLogged } from "@server/lib/traceback";

function captureLines() {
  const lines: string[] = [];
  const stream = {
    write: (chunk: string) => {
      lines.push(chunk);
      return true;
    },
  };
  return { lines, stream };
}

describe("proper traceback (the next 500 tells the whole story)", () => {
  it("structures message, stack frames, code, and cause chain", () => {
    const root = new Error("connection terminated");
    (root as { code?: string }).code = "ECONNRESET";
    const wrapped = new Error("getWorkspace failed", { cause: root });

    const trace = errorTrace(wrapped);
    expect(trace.message).toBe("getWorkspace failed");
    expect(trace.type).toBe("Error");
    expect(trace.stack?.length).toBeGreaterThan(0);
    expect(trace.stack?.some((line) => line.includes("at "))).toBe(true);
    expect(trace.cause?.message).toBe("connection terminated");
    expect(trace.cause?.code).toBe("ECONNRESET");
    expect(trace.cause?.type).toBe("Error");
  });

  it("keeps AggregateError members instead of collapsing them to a string", () => {
    const aggregate = new AggregateError(
      [new Error("db down"), new Error("redis down")],
      "dependencies failed",
    );

    const trace = errorTrace(aggregate);
    expect(trace.type).toBe("AggregateError");
    expect(trace.errors?.map((e) => e.message)).toEqual([
      "db down",
      "redis down",
    ]);
  });

  it("never explodes on non-errors or cyclic causes", () => {
    expect(errorTrace("boom")).toEqual({ message: "boom" });
    expect(errorTrace(undefined)).toEqual({ message: "undefined" });
    const cyclic = new Error("loop") as Error & { cause?: unknown };
    cyclic.cause = cyclic;
    const trace = errorTrace(cyclic);
    // Depth-capped: walks 5 levels then stops with a plain message.
    let depth = 0;
    let node = trace.cause;
    while (node?.cause && typeof node.cause === "object") {
      depth += 1;
      node = node.cause;
    }
    expect(depth).toBeLessThanOrEqual(5);
  });

  it("logs one joined line: context next to the full trace", () => {
    const { lines, stream } = captureLines();
    const log = pino({ level: "info" }, stream as never);
    const err = new Error("relation does not exist");
    (err as { code?: string }).code = "42P01";

    logTraceback(log, "Failed to load workspace", err, {
      userId: "user-1",
      workspaceId: "w1",
      requestId: "req-abc",
    });

    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]);
    expect(line.msg).toBe("Failed to load workspace");
    expect(line.userId).toBe("user-1");
    expect(line.workspaceId).toBe("w1");
    expect(line.requestId).toBe("req-abc");
    expect(line.error.message).toContain("relation does not exist");
    expect(line.error.code).toBe("42P01");
    expect(line.error.stack.length).toBeGreaterThan(0);
    expect(line.error.type).toBe("Error");
  });

  it("marks errors as logged so the global boundary does not log twice", () => {
    const { stream } = captureLines();
    const log = pino({ level: "info" }, stream as never);
    const err = new Error("already handled");

    expect(wasLogged(err)).toBe(false);
    logTraceback(log, "origin", err, { requestId: "req-1" });
    expect(wasLogged(err)).toBe(true);
    expect(wasLogged("not an object")).toBe(false);
  });
});
