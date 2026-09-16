import { createPrivateKey, createPublicKey, randomBytes } from "node:crypto";

// The browser job runs the Go identity service and Node monolith together.
// Generate an isolated signing pair per CI run so Node can verify assertions
// issued by that exact Go process. Values go only to GitHub's masked job env.
const seed = randomBytes(32);
const privateKey = createPrivateKey({
  key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    seed,
  ]),
  format: "der",
  type: "pkcs8",
});
const publicKey = createPublicKey(privateKey)
  .export({ format: "der", type: "spki" })
  .subarray(-32);

process.stdout.write(`AUTH_ASSERTION_PRIVATE_KEY=${seed.toString("base64")}\n`);
process.stdout.write(
  `AUTH_ASSERTION_PUBLIC_KEY=${publicKey.toString("base64")}\n`,
);
process.stdout.write(`AUTH_INTERNAL_KEY=${randomBytes(32).toString("hex")}\n`);
process.stdout.write(`INTERNAL_API_KEY=${randomBytes(32).toString("hex")}\n`);
