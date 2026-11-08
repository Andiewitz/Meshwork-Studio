const RELOAD_KEY = "meshwork-chunk-reload-at";
const RETRY_WINDOW_MS = 60_000;

export function isChunkError(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
      error.message,
    )
  );
}

/** A stale deployment can require a reload; repeated failures need user control. */
export function retryStaleChunkOnce(error: Error): void {
  if (!isChunkError(error)) return;
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    if (last > 0 && now - last < RETRY_WINDOW_MS) return;
    sessionStorage.setItem(RELOAD_KEY, String(now));
    window.location.reload();
  } catch {
    // Storage may be unavailable; keep the retry UI instead of reloading forever.
  }
}
