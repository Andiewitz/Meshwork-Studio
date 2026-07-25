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
 * Formats any raw error (HTTP error, thrown exception, or API response)
 * into a clean, human-readable message suitable for toasts and UI alerts.
 */
export function formatUserErrorMessage(
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

  // 1. Authentication / Invalid Credentials
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
