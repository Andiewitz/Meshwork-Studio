import type { ZodError } from "zod";
import type { ApiIssue } from "./errorEnvelope";

/**
 * One shape for field-level detail everywhere: `issues: [{ path, message }]`.
 * Canvas validation, body validation, and import warnings all derive from
 * this so clients parse a single structure.
 */
export function zodIssues(error: ZodError, limit = 10): ApiIssue[] {
  return error.issues.slice(0, limit).map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

/** Short human message for the envelope's top-level `message`. */
export function firstIssueMessage(
  error: ZodError,
  fallback = "Validation failed",
): string {
  const first = zodIssues(error, 1)[0];
  return first ? `${first.path}: ${first.message}` : fallback;
}
