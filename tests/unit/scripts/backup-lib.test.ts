import { describe, expect, it } from "vitest";
import {
  requiredDatabaseTargets,
  requiredS3Uri,
} from "../../../scripts/backup-lib";

const completeEnvironment = {
  AUTH_DATABASE_URL: "postgresql://auth:pw@db/auth",
  WORKSPACE_DATABASE_URL: "postgresql://workspace:pw@db/workspace",
  TEAM_DATABASE_URL: "postgresql://team:pw@db/team",
  AI_DATABASE_URL: "postgresql://ai:pw@db/ai",
  METRICS_DATABASE_URL: "postgresql://metrics:pw@db/metrics",
};

describe("backup configuration", () => {
  it("requires every database boundary and gives Jenkos precedence", () => {
    const targets = requiredDatabaseTargets({
      ...completeEnvironment,
      JENKOS_DATABASE_URL: "postgresql://jenkos:pw@db/jenkos",
    });

    expect(targets.map((target) => target.name)).toEqual([
      "auth",
      "workspace",
      "team",
      "jenkos",
      "metrics",
    ]);
    expect(targets.find((target) => target.name === "jenkos")?.url).toContain(
      "/jenkos",
    );
  });

  it("fails before backup when any service database is missing", () => {
    const { TEAM_DATABASE_URL: _removed, ...incomplete } = completeEnvironment;
    expect(() => requiredDatabaseTargets(incomplete)).toThrow(
      "TEAM_DATABASE_URL",
    );
  });

  it("accepts only an explicit S3 destination", () => {
    expect(() => requiredS3Uri({})).toThrow("BACKUP_S3_URI");
    expect(() => requiredS3Uri({ BACKUP_S3_URI: "https://bucket" })).toThrow(
      "BACKUP_S3_URI",
    );
    expect(
      requiredS3Uri({ BACKUP_S3_URI: "s3://meshwork-backups/prod/" }),
    ).toBe("s3://meshwork-backups/prod");
  });
});
