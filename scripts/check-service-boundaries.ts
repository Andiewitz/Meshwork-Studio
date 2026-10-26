import path from "node:path";
import { auditRepository } from "./lib/service-boundaries";

const violations = auditRepository(path.resolve(process.cwd()));
if (violations.length) {
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line} ${violation.specifier}: ${violation.reason}`,
    );
    if (violation.chain) console.error(`  via ${violation.chain.join(" -> ")}`);
  }
  process.exitCode = 1;
} else
  console.info(
    "Service boundaries verified (resolved static, type, dynamic, and re-export imports).",
  );
