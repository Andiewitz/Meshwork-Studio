/**
 * Utility functions for user-friendly error formatting and UX handling.
 * Strips technical codes, JSON strings, and HTTP status prefixes from user-facing error messages.
 */

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Quotable support ID derived from a request ID (`req-<24hex>` or bare hex).
 * Display form `XXXX-XXXX` (first 4 + last 4 hex chars, uppercase).
 * Support joins it with `grep -i <chunk>` against server logs, which always
 * carry the full request ID. Mirrors `supportIdFrom` in
 * `server/lib/errorEnvelope.ts` — keep the algorithms identical.
 */
export function supportIdFrom(
  requestId: string | undefined | null,
): string | undefined {
  if (!requestId) return undefined;
  const hex = requestId.replace(/^req-/i, "");
  if (!/^[0-9a-fA-F]{8,}$/.test(hex)) return undefined;
  const h = hex.toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(-4)}`;
}

/** Pull a server request ID out of any error shape without throwing. */
export function requestIdOf(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    const data = error.data as Record<string, unknown> | undefined;
    if (data && typeof data.requestId === "string") return data.requestId;
  }
  if (typeof error === "object" && error !== null) {
    const id = (error as Record<string, unknown>).requestId;
    if (typeof id === "string") return id;
  }
  return undefined;
}

export interface SupportError {
  message: string;
  code?: string;
  requestId?: string;
  supportId?: string;
  status?: number;
}

/** Friendly message + preserved server signal (code/IDs) for toasts. */
export function toSupportError(
  error: unknown,
  fallbackMessage = "Something went wrong. Please try again.",
): SupportError {
  const out: SupportError = {
    message: formatUserErrorMessage(error, fallbackMessage),
  };
  const requestId = requestIdOf(error);
  if (requestId) {
    out.requestId = requestId;
    out.supportId = supportIdFrom(requestId);
  }
  const data =
    error instanceof ApiError
      ? (error.data as Record<string, unknown> | undefined)
      : undefined;
  if (data && typeof data.code === "string") out.code = data.code;
  if (error instanceof ApiError) out.status = error.status;
  return out;
}

/** Friendly text only (no IDs) — the shared core behind both formatters. */
function friendlyMessage(
  error: unknown,
  fallbackMessage = "Something went wrong. Please try again.",
): string {
  if (!error) return fallbackMessage;

  let rawMessage = "";
  let statusCode: number | null = null;

  if (error instanceof ApiError) {
    statusCode = error.status;
    rawMessage = error.message;
  } else if (error instanceof Error) {
    rawMessage = error.message;
  } else if (typeof error === "string") {
    rawMessage = error;
  } else if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>;
    if (typeof errObj.message === "string") {
      rawMessage = errObj.message;
    }
    if (typeof errObj.status === "number") {
      statusCode = errObj.status;
    }
  }

  // Parse HTTP status prefix if present (e.g. "401: {"message":"..."}")
  const statusMatch = /^(\d{3}):\s*(.*)$/.exec(rawMessage);
  if (statusMatch) {
    statusCode = parseInt(statusMatch[1], 10);
    rawMessage = statusMatch[2];
  }

  // Try extracting inner message if rawMessage is a JSON string
  if (rawMessage.startsWith("{") && rawMessage.endsWith("}")) {
    try {
      const parsed = JSON.parse(rawMessage);
      if (parsed && typeof parsed.message === "string") {
        rawMessage = parsed.message;
      }
    } catch {
      // Ignore JSON parse failure
    }
  }

  // Normalize lower-case string for matching
  const lower = rawMessage.toLowerCase();

  // 1. Authentication — read the server code before blaming credentials:
  // SESSION_EXPIRED/NO_SESSION mean "log in again", only a login-endpoint
  // failure means the password was wrong.
  const code =
    error instanceof ApiError
      ? (error.data as Record<string, unknown> | undefined)?.code
      : undefined;
  if (
    code === "SESSION_EXPIRED" ||
    lower.includes("session expired") ||
    lower.includes("log in again")
  ) {
    return "Your session expired. Please log in again.";
  }
  if (
    statusCode === 401 ||
    lower.includes("authentication failed") ||
    lower.includes("invalid credentials") ||
    lower.includes("no account found") ||
    lower.includes("incorrect password")
  ) {
    return "Invalid email or password. Please check your credentials and try again.";
  }

  // 2. CSRF / Forbidden / Security Token
  if (
    statusCode === 403 ||
    lower.includes("csrf") ||
    lower.includes("forbidden") ||
    lower.includes("security token")
  ) {
    return "Security validation expired. Please refresh the page and try again.";
  }

  // 3. Account Conflict / Existing User
  if (
    statusCode === 409 ||
    lower.includes("already exists") ||
    lower.includes("registration could not be completed")
  ) {
    return "An account with this email address already exists. Please sign in instead.";
  }

  // 4. Rate Limiting
  if (
    statusCode === 429 ||
    lower.includes("too many requests") ||
    lower.includes("rate limit")
  ) {
    return "Too many attempts. Please wait a few moments and try again.";
  }

  // 4a. Unprocessable file (422) — wrong shape or nothing usable inside.
  // Our server messages here are pre-sanitized and specific, so prefer them.
  if (statusCode === 422 || lower.includes("doesn't look like")) {
    const cleaned422 = rawMessage.replace(/^[0-9]{3}:\s*/, "").trim();
    if (
      cleaned422 &&
      !cleaned422.startsWith("{") &&
      !cleaned422.startsWith("<") &&
      cleaned422.length < 200
    ) {
      return cleaned422;
    }
    return "That file couldn't be used. Check its contents and try again.";
  }

  // 4b. Payload too large (413) — file/canvas over the size limit.
  // Our server messages here are pre-sanitized and specific (size limits,
  // node counts), so prefer them over the generic fallback.
  if (
    statusCode === 413 ||
    lower.includes("too large") ||
    lower.includes("entity too large")
  ) {
    // Body-parser jargon ("request entity too large") is never shown —
    // fall through to the generic text below for it.
    if (!lower.includes("entity too large")) {
      const cleaned413 = rawMessage.replace(/^[0-9]{3}:\s*/, "").trim();
      if (
        cleaned413 &&
        !cleaned413.startsWith("{") &&
        !cleaned413.startsWith("<") &&
        cleaned413.length < 200
      ) {
        return cleaned413;
      }
    }
    return "That file is too large. Try a smaller file and upload again.";
  }

  // 5. Server Errors
  if (
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504 ||
    lower.includes("internal server error") ||
    lower.includes("service temporarily unavailable")
  ) {
    return "Our server encountered a temporary issue. Please try again shortly.";
  }

  // 6. Network / Offline Errors
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("eai_again") ||
    lower.includes("econnrefused")
  ) {
    return "Unable to connect to the server. Please check your internet connection.";
  }

  // 7. Clean fallback if rawMessage contains legible custom text without raw JSON/HTML
  const cleaned = rawMessage.replace(/^[0-9]{3}:\s*/, "").trim();
  if (
    cleaned &&
    !cleaned.startsWith("{") &&
    !cleaned.startsWith("<") &&
    cleaned.length < 150
  ) {
    return cleaned;
  }

  return fallbackMessage;
}

/**
 * Formats any raw error into a clean, human-readable message for toasts.
 * When the server attached a request ID, appends a quotable support ref
 * (`… (ref XXXX-XXXX)`) so users can report it and support can grep logs.
 * All existing callers get this automatically — no call-site changes.
 */
export function formatUserErrorMessage(
  error: unknown,
  fallbackMessage = "Something went wrong. Please try again.",
): string {
  const base = friendlyMessage(error, fallbackMessage);
  const supportId = supportIdFrom(requestIdOf(error));
  return supportId ? `${base} (ref ${supportId})` : base;
}
