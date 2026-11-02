import { Router, type Express } from "express";
import { z } from "zod";
import type { EventBus } from "@server/lib/events";
import { requireInternalKey } from "@server/lib/internal";
import { fail } from "@server/lib/errorEnvelope";
import { authorizeAccountCleanup } from "@server/auth/internal-client";

const requestSchema = z
  .object({
    operationId: z.string().uuid(),
    userId: z
      .string()
      .min(1)
      .max(128)
      .refine((value) => value.trim() === value),
    claimToken: z.string().uuid(),
    service: z.enum(["workspace", "team", "ai"]),
  })
  .strict();
type CleanupRequest = z.infer<typeof requestSchema>;
type Authorize = (input: CleanupRequest) => Promise<{ authorized: boolean }>;

// Internal-only bridge. Every delivery must be authorized by the identity
// owner against its current, already-fenced worker lease.
export function registerAccountCleanupInternalRoutes(
  app: Express,
  bus: Pick<EventBus, "executeRequired">,
  authorize: Authorize = authorizeAccountCleanup,
): void {
  const router = Router();
  router.use(requireInternalKey);
  router.post("/deliver", async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success)
      return fail(req, res, "VALIDATION_FAILED", "Invalid cleanup request");
    const { operationId, userId, service } = parsed.data;
    try {
      const decision = await authorize(parsed.data);
      if (!decision.authorized)
        return fail(req, res, "FORBIDDEN", "Cleanup delivery not authorized");
      const receipt = await bus.executeRequired(
        `account.cleanup.${service}`,
        { userId },
        { operationId },
      );
      return res.json(receipt);
    } catch {
      return fail(
        req,
        res,
        "SERVICE_UNAVAILABLE",
        "Cleanup delivery temporarily unavailable",
      );
    }
  });
  app.use("/internal/v1/account-cleanup", router);
}
