import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ERROR_CODES } from "../../../server/lib/errorCodes";

describe("error code registry", () => {
  it("matches the Go auth service mirror in codes.go", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../../../server/services/auth/internal/httpapi/codes.go",
      ),
      "utf8",
    );
    const goCodes: Record<string, number> = {};
    for (const match of source.matchAll(/^\s*"([A-Z0-9_]+)":\s*(\d+),/gm)) {
      goCodes[match[1]] = Number(match[2]);
    }
    expect(goCodes).toEqual(ERROR_CODES);
  });
});
