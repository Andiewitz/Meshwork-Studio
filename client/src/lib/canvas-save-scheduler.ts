/** Keep the trailing save responsive while bounding delays during continuous editing. */
export function canvasSaveDelay(firstEditAt: number, now: number): number {
  return Math.max(0, Math.min(3000, 15000 - Math.max(0, now - firstEditAt)));
}

/** Schedule a best-effort save when editing stops or the page becomes hidden. */
export function scheduleCanvasSave(
  save: () => void,
  delayMs = 3000,
): () => void {
  let pending = true;
  const cancel = () => {
    if (!pending) return;
    pending = false;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
  const flush = () => {
    if (!pending) return;
    cancel();
    save();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") flush();
  };
  const timer = setTimeout(flush, delayMs);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return cancel;
}
