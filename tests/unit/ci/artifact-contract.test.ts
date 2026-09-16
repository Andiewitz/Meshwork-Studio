import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const manifests = [
  "package.json",
  "package-lock.json",
  ".npmrc",
  "client/package.json",
  ...["ai", "canvas", "metrics", "team", "workspace"].map(
    (service) => `server/services/${service}/package.json`,
  ),
];

describe("dependency installation artifact contract", () => {
  it("provides the lockfile, npm config and workspaces before each Docker install", () => {
    const stages = read("Dockerfile")
      .split(/^FROM /m)
      .slice(1)
      .filter((stage) => stage.includes("RUN npm ci"));
    expect(stages).toHaveLength(2);
    for (const stage of stages) {
      const beforeInstall = stage.split("RUN npm ci")[0];
      for (const manifest of manifests) {
        expect(beforeInstall, `Missing ${manifest} in Docker stage`).toContain(
          manifest,
        );
      }
    }
  });

  it("ships the compiled frontend from the build stage", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("FROM nginx:1.27-alpine AS frontend");
    expect(dockerfile).toContain("COPY --from=build /app/dist/public");

    const compose = read("docker-compose.yml");
    expect(compose).toContain("target: runtime");
    expect(compose).toContain("target: frontend");
  });

  for (const environment of ["production", "staging"]) {
    it(`uploads the dependency inputs for ${environment}`, () => {
      const workflow = read(`.github/workflows/deploy-${environment}.yml`);
      const source = /^\s+source: "([^"]+)"/m.exec(workflow)?.[1].split(",");
      expect(source).toBeDefined();
      for (const manifest of manifests) {
        expect(
          source,
          `Missing ${fileURLToPath(new URL(manifest, root))}`,
        ).toContain(manifest);
      }
    });
  }
});
