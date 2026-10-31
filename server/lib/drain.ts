/** Drain active work before closing the resources it needs. The caller owns the deadline. */
export async function drainApplication(
  drain: (() => Promise<void>)[],
  close: (() => Promise<void>)[],
): Promise<PromiseSettledResult<void>[]> {
  const draining = await Promise.allSettled(
    drain.map((task) => Promise.resolve().then(task)),
  );
  const closed = await Promise.allSettled(
    close.map((task) => Promise.resolve().then(task)),
  );
  return [...draining, ...closed];
}
