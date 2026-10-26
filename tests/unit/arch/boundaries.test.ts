import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { auditRepository } from "../../../scripts/lib/service-boundaries";

/**
 * ARCHITECTURE ENFORCEMENT — database-per-service boundaries.
 *
 * Each service owns its database and is the only module allowed to touch
 * its tables. These tests fail the build if anyone re-couples the services
 * through imports, no matter how convenient it feels at the time.
 */

const SERVER_DIR = path.resolve(__dirname, "../../../server");
const SERVICES = ["auth", "canvas", "workspace", "team", "ai", "metrics"];

describe("service boundary enforcement", () => {
  it("production imports and public contract graphs respect service ownership", () => {
    expect(auditRepository(path.resolve(SERVER_DIR, ".."))).toEqual([]);
  });

  it("every domain service owns exactly one migrations folder (or none by design)", () => {
    const TS_SERVICES = SERVICES.filter((s) => s !== "auth"); // Go: internal/store/migrations
    const withMigrations = TS_SERVICES.filter((svc) =>
      fs.existsSync(path.join(SERVER_DIR, "services", svc, "db/migrations")),
    );
    // canvas persists in DynamoDB — no SQL migrations.
    expect(withMigrations.sort()).toEqual(
      ["ai", "metrics", "team", "workspace"].sort(),
    );
  });

  it("makeServiceDb has no shared-pool fallback", async () => {
    delete process.env.WORKSPACE_DATABASE_URL;
    vi.resetModules();
    await expect(import("@services/workspace/db/connection")).rejects.toThrow(
      /must be set/,
    );
  });
});
