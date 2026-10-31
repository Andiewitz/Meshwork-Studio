import { describe, expect, it, vi } from "vitest";
import { createServer, get } from "node:http";
import { drainApplication } from "@server/lib/drain";
describe("shutdown draining", () => {
  it("waits for an active HTTP request before closing dependencies", async () => {
    let finish!: () => void;
    const entered = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = createServer(async (_req, res) => {
      finish();
      await blocked;
      res.end("ok");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const port = (server.address() as { port: number }).port;
    const response = new Promise<string>((resolve, reject) => {
      get(`http://127.0.0.1:${port}`, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      }).on("error", reject);
    });
    await entered;
    const closePool = vi.fn(async () => {});
    const shutdown = drainApplication(
      [() => new Promise<void>((resolve) => server.close(() => resolve()))],
      [closePool],
    );
    await Promise.resolve();
    expect(server.listening).toBe(false);
    expect(closePool).not.toHaveBeenCalled();
    release();
    await expect(response).resolves.toBe("ok");
    await shutdown;
    expect(closePool).toHaveBeenCalledOnce();
  });
  it("still closes dependencies after a drain failure", async () => {
    const close = vi.fn(async () => {});
    const results = await drainApplication(
      [
        async () => {
          throw new Error("failed");
        },
      ],
      [close],
    );
    expect(results[0].status).toBe("rejected");
    expect(close).toHaveBeenCalledOnce();
  });
});
