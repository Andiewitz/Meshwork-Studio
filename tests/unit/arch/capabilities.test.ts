import { describe, expect, it } from "vitest";
import {
  capabilityState,
  startOptionalCapability,
} from "@server/lib/capabilities";
describe("optional capability startup", () => {
  it("records a failed optional module without throwing and allows another to start", async () => {
    await expect(
      startOptionalCapability("ai", async () => {
        throw new Error("offline");
      }),
    ).resolves.toBe(false);
    expect(capabilityState.ai).toBe("unavailable");
    await expect(
      startOptionalCapability("metrics", async () => {}),
    ).resolves.toBe(true);
    expect(capabilityState.metrics).toBe("ready");
  });
});
