export interface DatabaseBackupTarget {
  name: "auth" | "workspace" | "team" | "jenkos" | "metrics";
  url: string;
}

const requiredDatabaseEnvironment = [
  ["auth", "AUTH_DATABASE_URL"],
  ["workspace", "WORKSPACE_DATABASE_URL"],
  ["team", "TEAM_DATABASE_URL"],
  ["metrics", "METRICS_DATABASE_URL"],
] as const;

function validPostgresUrl(value: string, name: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      throw new Error("unsupported protocol");
    }
    return value;
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL connection URL`);
  }
}

/** Return the complete, explicit service database set or throw before backup. */
export function requiredDatabaseTargets(
  env: NodeJS.ProcessEnv,
): DatabaseBackupTarget[] {
  const missing: string[] = requiredDatabaseEnvironment
    .filter(([, key]) => !env[key])
    .map(([, key]) => key);
  const jenkosKey = env.JENKOS_DATABASE_URL
    ? "JENKOS_DATABASE_URL"
    : "AI_DATABASE_URL";
  if (!env[jenkosKey]) missing.push("JENKOS_DATABASE_URL or AI_DATABASE_URL");
  if (missing.length > 0) {
    throw new Error(
      `Refusing incomplete backup; missing ${missing.join(", ")}`,
    );
  }

  const targets: DatabaseBackupTarget[] = requiredDatabaseEnvironment.map(
    ([name, key]) => ({
      name: name as DatabaseBackupTarget["name"],
      url: validPostgresUrl(env[key]!, key),
    }),
  );
  targets.splice(3, 0, {
    name: "jenkos",
    url: validPostgresUrl(env[jenkosKey]!, jenkosKey),
  });
  return targets;
}

/** Validate a fixed off-host destination without exposing its credentials. */
export function requiredS3Uri(env: NodeJS.ProcessEnv): string {
  const uri = env.BACKUP_S3_URI;
  if (!uri || !/^s3:\/\/[^/\s]+(?:\/[^\s]*)?$/.test(uri)) {
    throw new Error("BACKUP_S3_URI must be an s3://bucket/optional-prefix URI");
  }
  return uri.replace(/\/$/, "");
}
