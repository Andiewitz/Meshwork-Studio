import { describe, expect, it } from "vitest";
import { startMetricsServer } from "@server/lib/metricsServer";

describe("metrics lockdown (no public route, no token, loopback only)", () => {
  it("serves Prometheus text on loopback with no credentials", async () => {
    const server = startMetricsServer("127.0.0.1", 0);
    await new Promise<void>((resolve) => server.on("listening", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/metrics`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      const text = await res.text();
      expect(text).toContain("# HELP");
    } finally {
      server.close();
    }
  });

  it("refuses non-loopback hosts instead of silently exposing", () => {
    expect(() => startMetricsServer("0.0.0.0", 0)).toThrow(
      /non-loopback address/,
    );
  });
});
