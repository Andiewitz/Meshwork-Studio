// Set the environment before loading the application so `npm run dev` works
// consistently on Windows, macOS, and Linux.
process.env.NODE_ENV ??= "development";

await import("../server/index.ts");
