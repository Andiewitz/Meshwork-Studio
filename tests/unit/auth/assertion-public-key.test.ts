import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { Verifier } from "../../../server/auth/assertion";

function sign(
  privateKey: crypto.KeyObject,
  claims: Record<string, unknown>,
): string {
  const payload = Buffer.from(JSON.stringify(claims));
  const signature = crypto.sign(null, payload, privateKey);
  return `v1.${payload.toString("base64url")}.${signature.toString("base64url")}`;
}

describe("assertion verifier", () => {
  it("verifies an assertion using public material only", () => {
    const pair = crypto.generateKeyPairSync("ed25519");
    const rawPublicKey = pair.publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("base64");
    const verifier = new Verifier(rawPublicKey);
    const token = sign(pair.privateKey, {
      sub: "user-1",
      sid: "session-1",
      adm: false,
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    expect(verifier.verify(token)).toMatchObject({
      sub: "user-1",
      sid: "session-1",
    });
  });

  it("does not accept a signature from another key", () => {
    const trusted = crypto.generateKeyPairSync("ed25519");
    const untrusted = crypto.generateKeyPairSync("ed25519");
    const rawTrustedPublicKey = trusted.publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("base64");
    const verifier = new Verifier(rawTrustedPublicKey);
    const token = sign(untrusted.privateKey, {
      sub: "user-1",
      sid: "session-1",
      adm: false,
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    expect(verifier.verify(token)).toBeNull();
  });
});
