#!/usr/bin/env npx tsx
/**
 * Configuration Diagnostic
 *
 * Verifies the environment for BOTH processes: the Node monolith and the Go
 * auth service. Run locally or on the server:
 *
 *   npx tsx scripts/diagnose-config.ts
 */

import crypto from "node:crypto";
import { config as loadEnv } from "dotenv";
loadEnv();

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, message: string) {
  results.push({ name, passed, message });
}

function has(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}

function base64Bytes(key: string): number | null {
  const v = process.env[key];
  if (!v) return null;
  try {
    return Buffer.from(v.trim(), "base64").length;
  } catch {
    return -1;
  }
}

function publicKeyFromSeed(seedBase64: string): string | null {
  const seed = Buffer.from(seedBase64, "base64");
  if (seed.length !== 32) return null;
  const privateKey = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from([
        0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
        0x04, 0x22, 0x04, 0x20,
      ]),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
  return crypto
    .createPublicKey(privateKey)
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64");
}

const isProd = process.env.NODE_ENV === "production";

// ─── Monolith ────────────────────────────────────────────────────────────────

check("NODE_ENV", has("NODE_ENV"), `= ${process.env.NODE_ENV ?? "(unset)"}`);
for (const key of [
  "WORKSPACE_DATABASE_URL",
  "TEAM_DATABASE_URL",
  "AI_DATABASE_URL",
  "METRICS_DATABASE_URL",
]) {
  check(
    key,
    has(key),
    has(key) ? "DSN present" : "database-per-service: required at boot",
  );
}
check(
  "CANVAS_DATABASE_URL",
  true,
  has("CANVAS_DATABASE_URL")
    ? "transitional (canvas → DynamoDB)"
    : "already on DynamoDB",
);
check(
  "REDIS_URL",
  has("REDIS_URL"),
  has("REDIS_URL") ? "present" : "optional (rate-limit/WS degradation)",
);
check(
  "SESSION_SECRET",
  isProd ? (process.env.SESSION_SECRET?.length ?? 0) >= 32 : true,
  isProd ? "must be ≥32 chars in production" : "dev — any value accepted",
);
check(
  "METRICS_BEARER_TOKEN",
  !isProd || has("METRICS_BEARER_TOKEN"),
  has("METRICS_BEARER_TOKEN")
    ? "/metrics protected"
    : "⚠ /metrics returns 404 in production",
);

// ─── Go auth service ────────────────────────────────────────────────────────

for (const key of ["AUTH_DATABASE_URL", "AUTH_REDIS_URL"]) {
  check(
    key,
    has(key),
    has(key) ? "present" : "auth service cannot boot without it",
  );
}

for (const key of [
  "AUTH_IP_HASH_KEY",
  "AUTH_ENCRYPTION_KEY",
  "AUTH_ASSERTION_PRIVATE_KEY",
  "AUTH_ASSERTION_PUBLIC_KEY",
  "ENCRYPTION_KEY",
]) {
  const bytes = base64Bytes(key);
  check(
    key,
    bytes === 32,
    bytes === 32
      ? "32-byte key OK"
      : `must be base64 of 32 bytes (got ${bytes ?? "unset"})`,
  );
}

const publicKey = process.env.AUTH_ASSERTION_PUBLIC_KEY;
const privateSeed = process.env.AUTH_ASSERTION_PRIVATE_KEY;
if (publicKey && privateSeed) {
  const derivedPublicKey = publicKeyFromSeed(privateSeed.trim());
  const same = derivedPublicKey === publicKey.trim();
  check(
    "assertion public/private pairing",
    same,
    same
      ? "monolith public key matches auth private signing seed"
      : "MISMATCH — monolith will reject every login",
  );
} else if (isProd) {
  check(
    "assertion public/private pairing",
    false,
    "both keys required in production",
  );
} else {
  check("assertion public/private pairing", true, "skipped (development)");
}

check(
  "AUTH_INTERNAL_KEY",
  !isProd || has("AUTH_INTERNAL_KEY"),
  has("AUTH_INTERNAL_KEY")
    ? "introspection enabled"
    : "required in production (monolith → auth)",
);

check(
  "SMTP_HOST + EMAIL_FROM",
  !isProd || (has("SMTP_HOST") && has("EMAIL_FROM")),
  has("SMTP_HOST")
    ? `relay: ${process.env.SMTP_HOST}`
    : "production needs email for verify/reset flows",
);

const googleOk = has("GOOGLE_CLIENT_ID") && has("GOOGLE_CLIENT_SECRET");
check(
  "Google OAuth",
  googleOk,
  googleOk ? "configured" : "optional — button disabled",
);

// ─── Report ─────────────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.passed);
for (const r of results) {
  const mark = r.passed ? "✔" : "✖";
  console.log(`${mark} ${r.name.padEnd(28)} ${r.message}`);
}

console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
if (failed.length > 0) {
  console.error(`\nFAILED:\n${failed.map((f) => ` - ${f.name}`).join("\n")}`);
  process.exit(1);
}
