#!/usr/bin/env tsx
/**
 * Configuration Diagnostic Script
 * Run locally or in production to verify all required config
 * Usage: npx tsx scripts/diagnose-config.ts
 */

import { config } from "dotenv";
config();

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const checks: CheckResult[] = [];

function check(
  name: string,
  condition: boolean,
  message: string,
  details?: any,
) {
  checks.push({ name, passed: condition, message, details });
  const icon = condition ? "✅" : "❌";
  console.log(`${icon} ${name}: ${message}`);
  if (details && !condition) console.log(`   Details:`, details);
}

async function runDiagnostics() {
  console.log("🔍 Configuration Diagnostics\n");
  console.log("Environment:", process.env.NODE_ENV || "undefined");
  console.log("");

  // 1. Required Environment Variables
  console.log("=== Required Environment Variables ===");
  const requiredVars = [
    "DATABASE_URL",
    "JWT_SECRET",
    "SESSION_SECRET",
    "NODE_ENV",
    "FRONTEND_URL",
    "PORT",
  ];

  for (const varName of requiredVars) {
    const value = process.env[varName];
    check(
      varName,
      !!value,
      value ? `Set (${value.length} chars)` : "MISSING",
      value
        ? { length: value.length, preview: value.slice(0, 20) + "..." }
        : undefined,
    );
  }

  // 2. Redis Configuration
  console.log("\n=== Redis Configuration ===");
  const redisUrl = process.env.REDIS_URL;
  check(
    "REDIS_URL",
    redisUrl !== undefined,
    redisUrl
      ? redisUrl
        ? "Set"
        : "Explicitly disabled (empty)"
      : "Not set (will auto-connect)",
    redisUrl ? { value: redisUrl.slice(0, 30) } : undefined,
  );

  // 3. Test Database Connection
  console.log("\n=== Database Connection ===");
  if (process.env.DATABASE_URL) {
    try {
      const { Pool } = await import("pg");
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,
      });
      const client = await pool.connect();
      const result = await client.query(
        "SELECT NOW() as time, current_database() as db",
      );
      client.release();
      await pool.end();
      check(
        "Database Connection",
        true,
        `Connected to ${result.rows[0].db} at ${result.rows[0].time}`,
        { database: result.rows[0].db },
      );
    } catch (error: any) {
      check("Database Connection", false, "FAILED", {
        error: error.message,
        code: error.code,
      });
    }
  } else {
    check("Database Connection", false, "DATABASE_URL not set");
  }

  // 4. Test Redis Connection (if configured)
  console.log("\n=== Redis Connection ===");
  if (process.env.REDIS_URL && process.env.REDIS_URL !== "") {
    try {
      const redis = await import("redis").catch(() => null);
      if (!redis) {
        check("Redis Connection", false, "SKIPPED", {
          reason: "redis package not installed locally",
        });
      } else {
        const client = redis.createClient({ url: process.env.REDIS_URL });
        await client.connect();
        await client.ping();
        await client.quit();
        check("Redis Connection", true, "Connected successfully");
      }
    } catch (error: any) {
      check("Redis Connection", false, "FAILED", { error: error.message });
    }
  } else {
    check("Redis Connection", true, "Disabled (REDIS_URL empty or not set)");
  }

  // 5. Check JWT_SECRET Strength
  console.log("\n=== Security Checks ===");
  if (process.env.JWT_SECRET) {
    const secret = process.env.JWT_SECRET;
    const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(secret);
    const decodedLen = Buffer.from(secret, "base64").length;
    check(
      "JWT_SECRET Strength",
      decodedLen >= 32,
      `Length: ${decodedLen} bytes (base64 decoded), ${secret.length} chars`,
      { isBase64, decodedLength: decodedLen },
    );
  }

  if (process.env.SESSION_SECRET) {
    const secret = process.env.SESSION_SECRET;
    const decodedLen = Buffer.from(secret, "base64").length;
    check(
      "SESSION_SECRET Strength",
      decodedLen >= 32,
      `Length: ${decodedLen} bytes (base64 decoded), ${secret.length} chars`,
      { decodedLength: decodedLen },
    );
  }

  // 6. Google OAuth (optional but good to verify)
  console.log("\n=== Optional: Google OAuth ===");
  check(
    "GOOGLE_CLIENT_ID",
    !!process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_ID ? "Set" : "Not configured",
  );
  check(
    "GOOGLE_CLIENT_SECRET",
    !!process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CLIENT_SECRET ? "Set" : "Not configured",
  );

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("SUMMARY");
  console.log("=".repeat(50));
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;
  console.log(
    `Total: ${checks.length} | Passed: ${passed} | Failed: ${failed}`,
  );

  if (failed > 0) {
    console.log("\n❌ FAILED CHECKS:");
    checks
      .filter((c) => !c.passed)
      .forEach((c) => {
        console.log(`  - ${c.name}: ${c.message}`);
        if (c.details) console.log(`    ${JSON.stringify(c.details)}`);
      });
    console.log("\n🔧 Fix the failed checks above, then redeploy.");
    process.exit(1);
  } else {
    console.log("\n🎉 ALL CHECKS PASSED - Configuration looks good!");
    process.exit(0);
  }
}

runDiagnostics().catch(console.error);
