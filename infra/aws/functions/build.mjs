import { build } from "esbuild";
await build({
  entryPoints: [
    "src/intake.mjs",
    "src/worker.mjs",
    "src/feedback.mjs",
    "src/monitor.mjs",
  ],
  outdir: "../.build",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outExtension: { ".js": ".cjs" },
  sourcemap: false,
});
