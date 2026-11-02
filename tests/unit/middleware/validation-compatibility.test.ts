import { describe, expect, it } from "vitest";
import { z } from "zod";
import { z as legacy } from "zod/v3";
import "@server/lib/zodLegacyErrors";

describe("validation error compatibility", () => {
  it("retains established default messages for common invalid inputs", () => {
    const cases = [
      [z.string(), legacy.string(), undefined],
      [z.string(), legacy.string(), 5],
      [z.string().max(3), legacy.string().max(3), "abcd"],
      [z.array(z.string()).min(2), legacy.array(legacy.string()).min(2), []],
      [z.number().int(), legacy.number().int(), 2.5],
      [z.string().email(), legacy.string().email(), "bad"],
      [z.enum(["a", "b"]), legacy.enum(["a", "b"]), "c"],
      [z.literal("ok"), legacy.literal("ok"), "bad"],
    ] as const;
    for (const [currentSchema, previousSchema, input] of cases) {
      const current = currentSchema.safeParse(input);
      const previous = previousSchema.safeParse(input);
      expect(current.success).toBe(false);
      expect(previous.success).toBe(false);
      if (!current.success && !previous.success)
        expect(current.error.issues[0].message).toBe(
          previous.error.issues[0].message,
        );
    }
  });
});
