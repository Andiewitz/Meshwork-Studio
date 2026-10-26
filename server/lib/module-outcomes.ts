/** Internal contracts only: these outcomes are not HTTP response envelopes. */
export interface Unavailable {
  status: "unavailable";
  cause: unknown;
}
export type Lookup<T> =
  { status: "found"; value: T } | { status: "missing" } | Unavailable;
export type Decision = { status: "allowed" | "denied" } | Unavailable;
export type QueryResult<T> = { status: "available"; value: T } | Unavailable;

/** Preserve the caller's existing error handling; never turn outages into absence. */
export function readLookup<T>(result: Lookup<T>): T | undefined {
  if (result.status === "unavailable") throw result.cause;
  return result.status === "found" ? result.value : undefined;
}

export function readDecision(result: Decision): boolean {
  if (result.status === "unavailable") throw result.cause;
  return result.status === "allowed";
}

export function readQuery<T>(result: QueryResult<T>): T {
  if (result.status === "unavailable") throw result.cause;
  return result.value;
}
