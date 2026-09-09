import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    env: {
      WORKSPACE_DATABASE_URL:
        process.env.WORKSPACE_DATABASE_URL ||
        "postgresql://test@localhost:5434/workspace_db",
      TEAM_DATABASE_URL:
        process.env.TEAM_DATABASE_URL ||
        "postgresql://test@localhost:5434/team_db",
      AI_DATABASE_URL:
        process.env.AI_DATABASE_URL || "postgresql://test@localhost:5434/ai_db",
      METRICS_DATABASE_URL:
        process.env.METRICS_DATABASE_URL ||
        "postgresql://test@localhost:5434/metrics_db",
      CANVAS_DATABASE_URL:
        process.env.CANVAS_DATABASE_URL ||
        "postgresql://test@localhost:5434/workspace_db",
      NODE_ENV: "test",
    },
    globals: true,
    environment: "node",
    // Fast, hermetic checks run by default. Tests that require DynamoDB Local
    // or a socket server live under tests/system and run explicitly in CI.
    include: ["tests/{unit,integration}/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      exclude: ["node_modules/", "tests/"],
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
      "@shared": path.resolve(__dirname, "./server/shared"),
      "@services": path.resolve(__dirname, "./server/services"),
      "@server": path.resolve(__dirname, "./server"),
    },
  },
});
