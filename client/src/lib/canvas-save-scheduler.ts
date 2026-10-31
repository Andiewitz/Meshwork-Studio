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
