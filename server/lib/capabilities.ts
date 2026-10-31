/** Startup status is process-local and is reported separately from core readiness. */
export type CapabilityState = "starting" | "ready" | "unavailable" | "stopped";
export const capabilityState: Record<"ai" | "metrics", CapabilityState> = {
  ai: "starting",
  metrics: "starting",
};
export async function startOptionalCapability(
  name: "ai" | "metrics",
  start: () => Promise<void>,
): Promise<boolean> {
  capabilityState[name] = "starting";
  try {
    await start();
    capabilityState[name] = "ready";
    return true;
  } catch {
    capabilityState[name] = "unavailable";
    return false;
  }
}
