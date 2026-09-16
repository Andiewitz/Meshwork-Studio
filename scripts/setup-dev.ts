#!/usr/bin/env npx tsx
/**
 * Meshwork Studio — Automated Development Environment Setup
 *
 * Generates local `.env` and `server/services/auth/.env` with cryptographically
 * secure random keys and default development connection strings.
 *
 * Usage:
 *   npx tsx scripts/setup-dev.ts
 *   npx tsx scripts/setup-dev.ts --force
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const ROOT_ENV = path.join(ROOT_DIR, ".env");
const AUTH_ENV_DIR = path.join(ROOT_DIR, "server", "services", "auth");
const AUTH_ENV = path.join(AUTH_ENV_DIR, ".env");

const isForce = process.argv.includes("--force") || process.argv.includes("-f");

console.log(
  "\x1b[1m\x1b[36m======================================================\x1b[0m",
);
console.log(
  "\x1b[1m\x1b[36m   🛠️  Meshwork Studio — Local Development Setup       \x1b[0m",
);
console.log(
  "\x1b[1m\x1b[36m======================================================\x1b[0m\n",
);

function randB64(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64");
}

function randHex(bytes = 16): string {
  return crypto.randomBytes(bytes).toString("hex");
}

// 1. Check existing files
const rootEnvExists = fs.existsSync(ROOT_ENV);
const authEnvExists = fs.existsSync(AUTH_ENV);

if (rootEnvExists && authEnvExists && !isForce) {
  console.log(
    "\x1b[33mℹ Both .env and server/services/auth/.env already exist.\x1b[0m",
  );
  console.log(
    "  To re-generate them with fresh keys, run: \x1b[1mnpm run setup -- --force\x1b[0m\n",
  );
  console.log("Running configuration diagnosis...\n");
  import("./diagnose-config.js").catch(() => {
    // ignore if TS dynamic import path varies
  });
  process.exit(0);
}

// 2. Generate shared cryptographic keys
console.log("\x1b[34m▶ Generating cryptographic seeds and keys...\x1b[0m");

const assertionSeed = randB64(32); // Shared 32-byte seed for Go signer & Node verifier
const ipHashKey = randB64(32); // HMAC key for pseudonymizing IPs
const encryptionKey = randB64(32); // AES-256-GCM key for TOTP secrets
const sessionSecret = randB64(32); // Express cookie signing secret
const authInternalKey = randHex(24);
const internalApiKey = randHex(24);
const metricsToken = randHex(16);

// Password seeds for local databases
const postgresSuperPassword = "postgres_dev_password";
const authDbPassword = "auth_dev_password";
const workspaceDbPassword = "workspace_dev_password";
const teamDbPassword = "team_dev_password";
const aiDbPassword = "ai_dev_password";
const metricsDbPassword = "metrics_dev_password";

// 3. Write root .env
if (!rootEnvExists || isForce) {
  const rootEnvContent = `# ==============================================================================
# Meshwork Studio — Local Development Environment Configuration
# Generated automatically by 'npm run setup'
# ==============================================================================

# === APP ===
NODE_ENV=development
PORT=5000
APP_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5000

# === DATABASES (Local Docker Postgres on :5434) ===
POSTGRES_SUPERUSER=postgres
POSTGRES_SUPERUSER_PASSWORD=${postgresSuperPassword}

AUTH_DB_PASSWORD=${authDbPassword}
WORKSPACE_DB_PASSWORD=${workspaceDbPassword}
TEAM_DB_PASSWORD=${teamDbPassword}
AI_DB_PASSWORD=${aiDbPassword}
METRICS_DB_PASSWORD=${metricsDbPassword}

AUTH_DATABASE_URL=postgresql://auth_app:${authDbPassword}@localhost:5434/auth_db
WORKSPACE_DATABASE_URL=postgresql://workspace_app:${workspaceDbPassword}@localhost:5434/workspace_db
TEAM_DATABASE_URL=postgresql://team_app:${teamDbPassword}@localhost:5434/team_db
AI_DATABASE_URL=postgresql://ai_app:${aiDbPassword}@localhost:5434/ai_db
METRICS_DATABASE_URL=postgresql://metrics_app:${metricsDbPassword}@localhost:5434/metrics_db

# === CANVAS (DynamoDB Local on :8000) ===
CANVAS_DDB_TABLE=meshwork-canvas
AWS_REGION=us-east-1
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local

# === REDIS (Local Docker Redis on :6379) ===
REDIS_URL=redis://localhost:6379
AUTH_REDIS_URL=redis://localhost:6379

# === SECURITY & ASSERTIONS ===
SESSION_SECRET=${sessionSecret}
METRICS_BEARER_TOKEN=${metricsToken}
AUTH_ASSERTION_PUBLIC_KEY=${assertionSeed}
AUTH_INTERNAL_KEY=${authInternalKey}
INTERNAL_API_KEY=${internalApiKey}
AUTH_SERVICE_URL=http://localhost:8081

# === AI (Optional: add your API keys to enable AI features) ===
GEMINI_API_KEY=
OPENROUTER_API_KEY=
AI_PROVIDER_TIMEOUT_MS=45000

# === GOOGLE OAUTH (Optional: leave blank for email/password authentication) ===
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
`;

  fs.writeFileSync(ROOT_ENV, rootEnvContent, "utf-8");
  console.log("\x1b[32m✓ Created root .env\x1b[0m");
}

// 4. Write server/services/auth/.env
if (!fs.existsSync(AUTH_ENV_DIR)) {
  fs.mkdirSync(AUTH_ENV_DIR, { recursive: true });
}

if (!authEnvExists || isForce) {
  const authEnvContent = `# ==============================================================================
# Meshwork Auth Service (Go) — Local Development Configuration
# Generated automatically by 'npm run setup'
# ==============================================================================

NODE_ENV=development
AUTH_PORT=8081
APP_PUBLIC_URL=http://localhost:5000

AUTH_DATABASE_URL=postgresql://auth_app:${authDbPassword}@localhost:5434/auth_db
AUTH_REDIS_URL=redis://localhost:6379

# Cryptographic Keys (matching root .env)
AUTH_IP_HASH_KEY=${ipHashKey}
AUTH_ENCRYPTION_KEY=${encryptionKey}
AUTH_ASSERTION_PRIVATE_KEY=${assertionSeed}
AUTH_INTERNAL_KEY=${authInternalKey}
AUTH_ASSERTION_TTL=5m

# Optional OAuth / Captcha
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CAPTCHA_PROVIDER=
CAPTCHA_SECRET=
`;

  fs.writeFileSync(AUTH_ENV, authEnvContent, "utf-8");
  console.log("\x1b[32m✓ Created server/services/auth/.env\x1b[0m");
}

console.log(
  "\n\x1b[1m\x1b[32m🎉 Development environment configured successfully!\x1b[0m\n",
);
console.log("Next steps to start developing:");
console.log("  1. Start local Docker databases & cache:");
console.log(
  "     \x1b[36mdocker-compose up -d emnesh-postgres emnesh-dynamodb-local emnesh-redis\x1b[0m",
);
console.log("  2. Start the development server:");
console.log("     \x1b[36mnpm run dev\x1b[0m\n");
