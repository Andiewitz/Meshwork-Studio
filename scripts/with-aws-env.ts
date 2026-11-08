/** Fetch Terraform's public runtime configuration through the instance role,
 * then execute a command without shell evaluation or printing configuration.
 * Usage: node dist/recovery/with-aws-env.cjs /meshwork-prod/runtime pm2 restart meshwork-auth --update-env
 */
import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";
import { spawn } from "node:child_process";

async function main() {
  const [prefix, command, ...args] = process.argv.slice(2);
  if (
    !prefix ||
    !/^\/meshwork-[a-z0-9-]+\/runtime\/?$/.test(prefix) ||
    !command
  ) {
    throw new Error("Usage: with-aws-env /meshwork-ENV/runtime command [args]");
  }
  const allowed = new Set([
    "BACKUP_S3_URI",
    "ARTIFACT_S3_BUCKET",
    "CANVAS_S3_BUCKET",
    "COGNITO_DOMAIN",
    "COGNITO_CLIENT_ID",
    "COGNITO_POOL_ID",
  ]);
  const client = new SSMClient({});
  const environment = { ...process.env };
  try {
    let next: string | undefined;
    do {
      const page = await client.send(
        new GetParametersByPathCommand({
          Path: prefix.replace(/\/$/, ""),
          WithDecryption: false,
          Recursive: false,
          NextToken: next,
        }),
      );
      for (const parameter of page.Parameters ?? []) {
        const name = parameter.Name?.split("/").pop();
        if (name && allowed.has(name) && parameter.Value)
          environment[name] = parameter.Value;
      }
      next = page.NextToken;
    } while (next);
    if (
      [
        "BACKUP_S3_URI",
        "COGNITO_DOMAIN",
        "COGNITO_CLIENT_ID",
        "COGNITO_POOL_ID",
      ].some((name) => !environment[name])
    )
      throw new Error("Required AWS runtime configuration is incomplete");
  } finally {
    client.destroy();
  }
  const child = spawn(command, args, {
    env: environment,
    stdio: "inherit",
    shell: false,
  });
  child.on("error", () => {
    console.error("Could not start command");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
main().catch(() => {
  console.error("AWS runtime configuration could not be loaded");
  process.exitCode = 1;
});
