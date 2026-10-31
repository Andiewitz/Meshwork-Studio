import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ensureSchema } from "@server/lib/migrate";

describe("migration lock", () => {
  it("locks before reading versions, applies once, and unlocks before release", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql.trim());
      return { rows: [] };
    });
    const release = vi.fn(() => calls.push("release"));
    const pool = {
      connect: async () => ({ query, release }),
    } as unknown as Pool;
    await ensureSchema("workspace", pool, [
      { version: "v1", up: "CREATE TABLE example(id int)" },
    ]);
    expect(calls[0]).toContain("pg_advisory_lock");
    expect(
      calls.findIndex((s) => s.startsWith("SELECT version")),
    ).toBeGreaterThan(0);
    expect(calls).toContain("CREATE TABLE example(id int)");
    expect(calls.at(-2)).toContain("pg_advisory_unlock");
    expect(calls.at(-1)).toBe("release");
  });
  it("serializes two simulated runners so the second sees the applied version", async () => {
    let held = false;
    const waiting: Array<() => void> = [];
    let applied = false;
    let executions = 0;
    const pool = {
      connect: async () => ({
        query: async (sql: string) => {
          if (sql.includes("pg_advisory_lock(")) {
            if (held)
              await new Promise<void>((resolve) => waiting.push(resolve));
            held = true;
          } else if (sql.includes("pg_advisory_unlock(")) {
            held = false;
            waiting.shift()?.();
          } else if (sql.startsWith("SELECT version"))
            return { rows: applied ? [{ version: "v1" }] : [] };
          else if (sql === "CREATE EXAMPLE") {
            executions++;
            await Promise.resolve();
          } else if (sql.startsWith("INSERT INTO schema_migrations"))
            applied = true;
          return { rows: [] };
        },
        release: () => {},
      }),
    } as unknown as Pool;
    await Promise.all([
      ensureSchema("workspace", pool, [
        { version: "v1", up: "CREATE EXAMPLE" },
      ]),
      ensureSchema("workspace", pool, [
        { version: "v1", up: "CREATE EXAMPLE" },
      ]),
    ]);
    expect(executions).toBe(1);
  });

  it("rolls back a failed migration and releases the lock", async () => {
    const calls: string[] = [];
    const query = vi.fn(async (sql: string) => {
      calls.push(sql.trim());
      if (sql === "BROKEN") throw new Error("bad migration");
      return { rows: [] };
    });
    const release = vi.fn();
    const pool = {
      connect: async () => ({ query, release }),
    } as unknown as Pool;
    await expect(
      ensureSchema("workspace", pool, [{ version: "v1", up: "BROKEN" }]),
    ).rejects.toThrow("migration v1 failed");
    expect(calls).toContain("ROLLBACK");
    expect(calls.at(-1)).toContain("pg_advisory_unlock");
    expect(release).toHaveBeenCalledWith(false);
  });
  it("discards a connection when unlocking fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("pg_advisory_unlock"))
        throw new Error("lost connection");
      return { rows: [] };
    });
    const release = vi.fn();
    const pool = {
      connect: async () => ({ query, release }),
    } as unknown as Pool;
    await ensureSchema("workspace", pool, []);
    expect(release).toHaveBeenCalledWith(true);
  });
});
