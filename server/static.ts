import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Works both under tsx (ESM) and the bundled CJS output.
const moduleDir =
  typeof __dirname === "string"
    ? __dirname
    : typeof import.meta !== "undefined" && import.meta.url
      ? path.dirname(fileURLToPath(import.meta.url))
      : process.cwd();

export function serveStatic(app: Express) {
  const distPath = path.resolve(moduleDir, "public");
  // Path is derived from the bundle location, never from user input, so the
  // non-literal-filename warning does not apply here.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist (for SPA routing)
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
