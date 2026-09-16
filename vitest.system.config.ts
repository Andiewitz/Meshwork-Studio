import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Infrastructure-backed checks are intentionally separate from the fast suite.
 * They run against DynamoDB Local and therefore must be selected explicitly.
 */
export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DYNAMODB_ENDPOINT:
        process.env.DYNAMODB_ENDPOINT ?? "http://127.0.0.1:8000",
    },
    globals: true,
    environment: "node",
    include: ["tests/system/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    testTimeout: 20_000,
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
