import { z } from "zod";
import { requestInternal, type InternalRequestOptions } from "../lib/internal";

const count = z.number().int().nonnegative();
const userStatsSchema = z.object({
  totalUsers: count,
  newUsersToday: count,
  activeUsers24h: count,
  loginsToday: count,
});

const auditSearchSchema = z.object({
  hits: z.array(
    z.object({
      userId: z.string(),
      email: z.string(),
      event: z.string(),
      ipHash: z.string(),
      requestId: z.string(),
      createdAt: z.string().datetime({ offset: true }),
    }),
  ),
});

function identityGet<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: InternalRequestOptions,
): Promise<T> {
  return requestInternal(
    "auth",
    process.env.AUTH_SERVICE_URL || "http://127.0.0.1:8081",
    process.env.AUTH_INTERNAL_KEY || "",
    path,
    schema,
    options,
  );
}

export function getIdentityStats(options?: InternalRequestOptions) {
  return identityGet("/internal/stats/users", userStatsSchema, options);
}

export function searchIdentityAudit(
  requestIdFragment: string,
  options?: InternalRequestOptions,
) {
  return identityGet(
    `/internal/audit-search?request_id=${encodeURIComponent(requestIdFragment)}`,
    auditSearchSchema,
    options,
  );
}
