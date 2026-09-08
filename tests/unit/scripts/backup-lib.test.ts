import { describe, expect, it } from "vitest";
import {
  requiredDatabaseTargets,
  requiredRestoreCanvasTable,
  requiredRestoreDatabaseTargets,
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

  it("requires drill-only restore targets that cannot resemble active stores", () => {
    const restore = requiredRestoreDatabaseTargets({
      RESTORE_DRILL_ID: "20260908",
      RESTORE_AUTH_DATABASE_URL:
        "postgresql://auth:pw@db/auth-restore-20260908",
      RESTORE_WORKSPACE_DATABASE_URL:
        "postgresql://workspace:pw@db/workspace-restore-20260908",
      RESTORE_TEAM_DATABASE_URL:
        "postgresql://team:pw@db/team-restore-20260908",
      RESTORE_JENKOS_DATABASE_URL:
        "postgresql://jenkos:pw@db/jenkos-restore-20260908",
      RESTORE_METRICS_DATABASE_URL:
        "postgresql://metrics:pw@db/metrics-restore-20260908",
    });
    expect(restore).toHaveLength(5);
    expect(
      requiredRestoreCanvasTable({
        RESTORE_DRILL_ID: "20260908",
        CANVAS_DDB_TABLE: "meshwork-canvas",
        RESTORE_CANVAS_DDB_TABLE: "meshwork-canvas-restore-20260908",
      }),
    ).toBe("meshwork-canvas-restore-20260908");
  });

  it("rejects an active or ambiguously named restore target", () => {
    expect(() =>
      requiredRestoreCanvasTable({
        RESTORE_DRILL_ID: "20260908",
        CANVAS_DDB_TABLE: "meshwork-canvas",
        RESTORE_CANVAS_DDB_TABLE: "meshwork-canvas",
      }),
    ).toThrow("restore-RESTORE_DRILL_ID");
  });
});
