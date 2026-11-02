import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Cursor signatures are process-scoped unless the deployment explicitly shares
// a secret. A different secret safely forces manual recovery after restart.
const cursorSchema = z
  .object({
    version: z.literal(1),
    workspaceId: z.string().min(1).max(128),
    userId: z.string().min(1).max(128),
    sessionId: z.string().min(1).max(128),
    accessEpoch: z.string().regex(/^[1-9][0-9]{0,19}$/),
    streamIncarnation: z.string().regex(/^[a-f0-9]{32,64}$/),
    streamId: z.string().regex(/^[0-9]{1,20}-[0-9]{1,20}$/),
    expiresAt: z.number().int().positive().safe(),
  })
  .strict();
export type ReplayCursor = z.infer<typeof cursorSchema>;
const bindingSchema = cursorSchema.pick({
  workspaceId: true,
  userId: true,
  sessionId: true,
  accessEpoch: true,
  streamIncarnation: true,
});
const CURSOR_LIFETIME_MS = 5 * 60 * 1000;
export type ReplayCursorBinding = Pick<
  ReplayCursor,
  "workspaceId" | "userId" | "sessionId" | "accessEpoch" | "streamIncarnation"
>;

function decodeCanonical(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

export function createReplayCursorSigner(secret: Buffer) {
  if (secret.length < 32)
    throw new Error("Replay cursor secret must be at least 32 bytes");
  // Avoid changing signatures if the caller later mutates its buffer.
  const key = Buffer.from(secret);
  const signature = (payload: string) =>
    createHmac("sha256", key).update(payload).digest();
  return {
    sign(input: Omit<ReplayCursor, "expiresAt">, now = Date.now()): string {
      const cursor = cursorSchema.parse({
        ...input,
        expiresAt: now + CURSOR_LIFETIME_MS,
      });
      const payload = Buffer.from(JSON.stringify(cursor)).toString("base64url");
      return `${payload}.${signature(payload).toString("base64url")}`;
    },
    verify(
      token: string,
      expected: ReplayCursorBinding,
      now = Date.now(),
    ): ReplayCursor | null {
      if (token.length > 4096 || !Number.isSafeInteger(now)) return null;
      const binding = bindingSchema.safeParse(expected);
      if (!binding.success) return null;
      const parts = token.split(".");
      if (parts.length !== 2) return null;
      const payload = decodeCanonical(parts[0]);
      const supplied = decodeCanonical(parts[1]);
      if (!payload || !supplied) return null;
      const wanted = signature(parts[0]);
      if (
        supplied.length !== wanted.length ||
        !timingSafeEqual(supplied, wanted)
      )
        return null;
      try {
        const parsed = cursorSchema.safeParse(
          JSON.parse(payload.toString("utf8")),
        );
        if (
          !parsed.success ||
          parsed.data.expiresAt <= now ||
          parsed.data.expiresAt > now + CURSOR_LIFETIME_MS
        )
          return null;
        for (const [name, value] of Object.entries(binding.data)) {
          if (parsed.data[name as keyof ReplayCursorBinding] !== value)
            return null;
        }
        return parsed.data;
      } catch {
        return null;
      }
    },
  };
}
