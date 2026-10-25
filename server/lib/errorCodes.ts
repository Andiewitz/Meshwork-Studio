/**
 * Canonical API error-code registry — the single source of truth for both
 * runtimes (Node monolith and Go auth service). A code is a stable
 * UPPER_SNAKE token clients may switch on; it always carries the same HTTP
 * status, whichever service emits it.
 *
 * Adding a code is additive: never reuse a retired token for a new meaning.
 * The Go service keeps its own constants in
 * `server/services/auth/internal/httpapi/codes.go`; `tests/unit/trace/
 * codes.test.ts` asserts the two lists stay in sync.
 */

export const ERROR_CODES = {
  // ── Generic transport / request failures ────────────────────────────────
  BAD_REQUEST: 400,
  INVALID_JSON: 400,
  INVALID_FORMAT: 400,
  VALIDATION_FAILED: 400,
  VALIDATION: 400,
  UNPROCESSABLE_ENTITY: 422,
  UNAUTHORIZED: 401,
  UNAUTHENTICATED: 401,
  NO_SESSION: 401,
  SESSION_EXPIRED: 401,
  SESSION_INVALID: 401,
  FORBIDDEN: 403,
  CSRF_REJECTED: 403,
  CSRF_ORIGIN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  DUPLICATE_VALUE: 409,
  REFERENCE_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  ACCOUNT_LOCKED: 423,
  RATE_LIMITED: 429,
  RATE_LIMIT_UNAVAILABLE: 503,

  // ── Server / dependency failures ────────────────────────────────────────
  INTERNAL: 500,
  INTERNAL_AUTH: 401,
  BYOK_DECRYPT_FAILED: 500,
  AUTH_SERVICE_UNAVAILABLE: 502,
  PROVIDER_ERROR: 502,
  UPSTREAM_FAILED: 502,
  SERVICE_UNAVAILABLE: 503,
  WORKSPACE_UNAVAILABLE: 503,
  TEAM_UNAVAILABLE: 503,
  AI_UNAVAILABLE: 503,
  AUDIT_UNAVAILABLE: 503,
  PROVIDER_TIMEOUT: 504,
  GATEWAY_TIMEOUT: 504,

  // ── Canvas ──────────────────────────────────────────────────────────────
  CANVAS_COPY_IN_PROGRESS: 409,
  CANVAS_COPY_RETRY_FAILED: 409,
  CANVAS_REVISION_CONFLICT: 409,
  INVALID_CANVAS: 400,
  NOT_A_CANVAS_FILE: 422,
  IMPORT_TOO_LARGE: 422,
  NOTHING_IMPORTABLE: 422,
  CANVAS_TOO_LARGE: 413,
  CANVAS_COPY_FAILED: 503,
  CANVAS_WRITE_IN_PROGRESS: 503,
  CANVAS_WRITE_INCOMPLETE: 503,
  CANVAS_DOC_CONFIG: 503,

  // ── AI ──────────────────────────────────────────────────────────────────
  NO_ACTIVE_KEY: 404,
  FALLBACK_NOT_CONFIGURED: 503,

  // ── Auth service (Go) ───────────────────────────────────────────────────
  INVALID_CREDENTIALS: 401,
  WEAK_PASSWORD: 400,
  BREACHED_PASSWORD: 400,
  TOKEN_INVALID: 400,
  LINK_INVALID: 400,
  MFA_TICKET_INVALID: 401,
  MFA_TICKET_REQUIRED: 401,
  MFA_INVALID: 401,
  MFA_ENABLED: 409,
  MFA_UNAVAILABLE: 503,
  HASH_BUSY: 429,
  REGISTRATION_UNAVAILABLE: 409,
  CAPTCHA_REQUIRED: 400,
  CAPTCHA_FAILED: 400,
  OAUTH_NOT_CONFIGURED: 503,
  OAUTH_UNAVAILABLE: 503,
} as const;

export type ApiErrorCode = keyof typeof ERROR_CODES;

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  408: "REQUEST_TIMEOUT",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_ENTITY",
  423: "ACCOUNT_LOCKED",
  429: "RATE_LIMITED",
  500: "INTERNAL",
  502: "UPSTREAM_FAILED",
  503: "SERVICE_UNAVAILABLE",
  504: "GATEWAY_TIMEOUT",
};

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_CODES, value);
}

export function statusForCode(code: ApiErrorCode): number {
  return ERROR_CODES[code];
}

/** Fallback token for statuses thrown by Express/body-parser/middleware. */
export function codeForStatus(status: number): ApiErrorCode | undefined {
  return STATUS_TO_CODE[status];
}
