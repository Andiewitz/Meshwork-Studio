import { describe, expect, it } from "vitest";
import { ReconnectBackoff } from "@/lib/reconnect-backoff";

describe("reconnect backoff", () => {
  it("backs off even if the server repeatedly accepts then closes the socket", () => {
    const retry = new ReconnectBackoff();
    retry.connected(0);
    expect(retry.nextDelay(100)).toBe(1000);
    retry.connected(1100);
    expect(retry.nextDelay(1200)).toBe(2000);
    retry.connected(3200);
    expect(retry.nextDelay(3300)).toBe(4000);
  });
  it("caps delays and resets after a stable connection", () => {
    const retry = new ReconnectBackoff();
    for (let i = 0; i < 8; i++) retry.nextDelay(i);
    expect(retry.nextDelay(8)).toBe(30000);
    retry.connected(100);
    expect(retry.nextDelay(30100)).toBe(1000);
  });
});
