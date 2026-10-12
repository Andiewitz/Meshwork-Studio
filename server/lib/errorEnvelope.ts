/**
 * Standard error envelope (additive rollout).
 *
 * Every error response SHOULD be `{ code, message, requestId }`. `message`
 * keeps its exact historical text so old clients keep working; `code` is a
 * stable UPPER_SNAKE token clients can switch on; `requestId` joins the
 * response to server logs (see server/middleware/requestId.ts).
 *
 * SECURITY: never forward internal codes (pg `23505`, errno strings) as
 * public `code`. `publicCodeOf` maps known internals to public tokens and
 * drops anything else to undefined.
 */

export interface ErrorBody {
  message: string;
  code?: string;
  requestId: string;
}

const PG_TO_PUBLIC: Record<string, { status: number; code: string }> = {
  "23505": { status: 400, code: "DUPLICATE_VALUE" },
  "23503": { status: 400, code: "REFERENCE_NOT_FOUND" },
  "22P02": { status: 400, code: "INVALID_FORMAT" },
};

/**
 * Public codes are UPPER_SNAKE without digits (pg codes contain digits).
 * Errno-style strings (ECONNREFUSED, EPIPE — leading E, no underscores)
 * are internal and never pass: use underscored tokens for new codes.
 */
export function isPublicCode(code: unknown): code is string {
  return (
    typeof code === "string" &&
    /^[A-Z][A-Z_]*$/.test(code) &&
    code.length <= 48 &&
    !/^E[A-Z]{2,}$/.test(code)
  );
}

/**
 * Resolve what public `{status, code}` an internal error code deserves:
 * known pg codes map to public tokens; already-public codes pass through;
 * anything else (errno strings, driver internals) resolves to {} so the
 * caller falls back to a generic 500 with no code.
 */
export function resolvePublicCode(internalCode: unknown): {
  status?: number;
  code?: string;
} {
  if (typeof internalCode !== "string") return {};
  const mapped = PG_TO_PUBLIC[internalCode];
  if (mapped) return mapped;
  if (isPublicCode(internalCode)) return { code: internalCode };
  return {};
}

export function errorBody(
  message: string,
  requestId: string,
  code?: string,
): ErrorBody {
  return code ? { message, code, requestId } : { message, requestId };
}
