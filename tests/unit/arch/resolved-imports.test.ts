import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { checkServiceBoundaries } from "../../../scripts/lib/service-boundaries";

const root = path.resolve("virtual-boundary-fixture");
const base = {
  "server/services/workspace/db/storage.ts":
    "export interface Row { id: string }; export const storage = {};",
  "server/services/workspace/db/connection.ts": "export const pool = {};",
  "server/services/workspace/db/migrations/index.ts":
    "export const MIGRATIONS = [];",
  "server/services/workspace/public.ts":
    "export interface Summary { id: string };",
  "server/shared/values.ts": "export const version = 1;",
};
function check(sources: Record<string, string>, assets: string[] = []) {
  return checkServiceBoundaries({
    root,
    sources: { ...base, ...sources },
    assets,
    compilerOptions: {
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      baseUrl: root,
      paths: {
        "@services/*": ["server/services/*"],
        "@server/*": ["server/*"],
        "@shared/*": ["server/shared/*"],
        "private-alias": ["server/services/workspace/db/storage.ts"],
      },
    },
  });
}

describe("resolved import boundary enforcement", () => {
  it.each([
    'import { storage } from "@services/workspace/db/storage";',
    'import type { Row } from "@services/workspace/db/storage";',
    'import {\n storage\n} from "../workspace/db/storage";',
    'export { storage } from "@server/services/workspace/db/storage";',
    'export type { Row } from "../workspace/db/storage";',
    'export * from "../workspace/db/storage";',
    'const storage = import("@services/workspace/db/storage");',
    "const storage = import(`../workspace/db/storage`);",
    'const storage = require("../workspace/db/storage");',
    'const storage = module.require("../workspace/db/storage");',
    'import storage = require("../workspace/db/storage");',
    'type Row = import("../workspace/db/storage").Row;',
    'import { storage } from "private-alias";',
  ])("rejects a foreign private import: %s", (source) => {
    const result = check({ "server/services/canvas/run.ts": source });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "server/services/canvas/run.ts",
          reason: expect.stringContaining("private"),
        }),
      ]),
    );
  });

  it("rejects a service root barrel even when it re-exports the desired name", () => {
    const result = check({
      "server/services/workspace/index.ts": 'export * from "./db/storage";',
      "server/services/canvas/run.ts":
        'import { storage } from "@services/workspace";',
    });
    expect(
      result.some((item) => item.file === "server/services/canvas/run.ts"),
    ).toBe(true);
    expect(
      result.some((item) => item.reason.includes("re-export internals")),
    ).toBe(true);
  });

  it("detects transitive type-only laundering through the shared hub and public facade", () => {
    const result = check({
      "server/services/workspace/public.ts":
        'export type { Row } from "./db/storage";',
      "server/shared/schema.ts":
        'export type { Row } from "@services/workspace/public";',
      "client/src/app.ts":
        'import type { Row } from "../../server/shared/schema";',
    });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: expect.stringContaining("Public contract reaches"),
          chain: expect.arrayContaining([
            "server/services/workspace/public.ts",
            "server/services/workspace/db/storage.ts",
          ]),
        }),
      ]),
    );
  });

  it("rejects runtime/SDK dependencies reached through a shared wrapper", () => {
    const result = check({
      "server/shared/values.ts":
        'export type { Client } from "./nested/client";',
      "server/shared/nested/client.ts":
        'export type { Pool as Client } from "pg";',
    });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          specifier: "pg",
          chain: ["server/shared/values.ts", "server/shared/nested/client.ts"],
        }),
      ]),
    );
  });

  it("rejects transitive imports through an undeclared runtime bridge", () => {
    expect(
      check({
        "server/lib/bridge.ts":
          'export { storage } from "@services/workspace/db/storage";',
        "server/services/canvas/run.ts":
          'import { storage } from "../../lib/bridge";',
      }),
    ).not.toEqual([]);
  });

  it.each(["import(variable)", "require(variable)"])(
    "fails closed on computed loading: %s",
    (source) => {
      expect(
        check({ "server/services/canvas/run.ts": source })[0]?.reason,
      ).toContain("Computed module loading");
    },
  );

  it("fails closed on unresolved local imports rather than skipping them", () => {
    expect(
      check({
        "server/services/canvas/run.ts":
          'import "@services/workspace/db/typo";',
      })[0]?.reason,
    ).toContain("Unresolved local import");
  });

  it("does not exempt any file merely named routes.ts or index.ts", () => {
    expect(
      check({
        "server/services/canvas/routes.ts":
          'import { pool } from "../workspace/db/connection";',
      }),
    ).not.toEqual([]);
  });

  it("allows only the declared composition edges, not every private import in that file", () => {
    expect(
      check({
        "server/routes.ts":
          'import { pool } from "@services/workspace/db/connection";',
      }),
    ).toEqual([]);
    expect(
      check({
        "server/routes.ts":
          'import { storage } from "@services/workspace/db/storage";',
      }),
    ).toEqual([]);
    expect(
      check({
        "server/routes.ts":
          'import type { Row } from "@services/workspace/db/storage";',
      }),
    ).toEqual([]);
    expect(
      check({
        "server/routes.ts": 'import "@services/workspace/db/other";',
        "server/services/workspace/db/other.ts": "export {};",
      }),
    ).not.toEqual([]);
  });

  it("prevents a consumer from importing the composition root as a bridge", () => {
    expect(
      check({
        "server/routes.ts":
          'import { pool } from "@services/workspace/db/connection";',
        "server/services/canvas/run.ts": 'import "../../routes";',
      }),
    ).not.toEqual([]);
  });

  it.each(["Date", "Buffer", "Uint8Array", "Map<string, string>"])(
    "rejects a runtime object in a public DTO: %s",
    (type) => {
      expect(
        check({
          "server/shared/dto.ts": `export interface DTO { timestamp: ${type} }`,
        }),
      ).not.toEqual([]);
    },
  );

  it("allows declared public contracts, own internals, browser-safe re-exports and cycles", () => {
    expect(
      check({
        "server/services/canvas/run.ts":
          'import type { Summary } from "@services/workspace/public";',
        "server/services/workspace/run.ts":
          'import { storage } from "./db/storage";',
        "server/shared/values.ts": 'export { version } from "./cycle";',
        "server/shared/cycle.ts":
          'import "./values"; export const version = 1;',
        "server/shared/schema.ts": 'export { z } from "zod";',
        "client/src/app.ts": 'import "../../server/shared/schema";',
      }),
    ).toEqual([]);
  });

  it("permits a real terminal asset but not a missing CSS-looking import", () => {
    const source = { "client/src/app.ts": 'import "./index.css";' };
    expect(check(source, ["client/src/index.css"])).toEqual([]);
    expect(check(source)).not.toEqual([]);
  });

  it("ignores comments and strings that merely mention a forbidden import", () => {
    expect(
      check({
        "server/services/canvas/run.ts":
          '// import "../workspace/db/storage";\nconst text = "@services/workspace/db/storage";',
      }),
    ).toEqual([]);
  });
});
