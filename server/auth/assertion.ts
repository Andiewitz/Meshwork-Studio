// Local verification of Go-issued session assertions.
//
// The auth service (server/services/auth) signs short-lived ed25519 tokens; this
// module verifies them with Node's built-in crypto. The monolith has NO
// access to auth_db — identity lives entirely behind the assertion.
//
// Wire format: v1.<base64url(payloadJSON)>.<base64url(sig)>
// payload: {sub, sid, adm, exp, kid?, eml?, nam?}

import crypto from "node:crypto";

export interface AssertionClaims {
  sub: string;
  sid: string;
  adm: boolean;
  exp: number;
  kid?: string;
  eml?: string;
  nam?: string;
}

export class Verifier {
  // kid → raw ed25519 public key (32 bytes)
  private keys = new Map<string, crypto.KeyObject>();
  public currentKid = "";

  /**
   * @param currentPublicKeyB64 base64 of the raw 32-byte ed25519 public key
   * @param previousPublicKeysB64 public keys still within their rotation window
   */
  constructor(
    currentPublicKeyB64: string,
    previousPublicKeysB64: string[] = [],
  ) {
    const load = (publicKeyB64: string): [string, crypto.KeyObject] => {
      const rawPublicKey = Buffer.from(publicKeyB64, "base64");
      if (rawPublicKey.length !== 32) {
        throw new Error(
          `auth/assertion: public key must be base64 of exactly 32 bytes, got ${rawPublicKey.length}`,
        );
      }
      const pub = crypto.createPublicKey({
        key: spkiForRawPublicKey(rawPublicKey),
        format: "der",
        type: "spki",
      });
      // Compute kid the same way Go does: sha256(rawPublicKey32Bytes)[:4] → hex.
      const kid = crypto
        .createHash("sha256")
        .update(rawPublicKey)
        .digest("hex")
        .slice(0, 8);
      return [kid, pub];
    };

    const [kid, pub] = load(currentPublicKeyB64);
    this.currentKid = kid;
    this.keys.set(kid, pub);
    for (const prev of previousPublicKeysB64) {
      if (!prev) continue;
      try {
        const [k, p] = load(prev);
        if (!this.keys.has(k)) this.keys.set(k, p);
      } catch {
        // A malformed rotation key must not prevent boot; skip it loudly.
        console.warn(`[auth] ignoring malformed previous assertion public key`);
      }
    }
  }

  /** Returns claims when the token is well-formed, correctly signed and
   *  unexpired (±30s leeway). Returns null otherwise — never throws. */
  verify(
    token: string | undefined | null,
    now = new Date(),
  ): AssertionClaims | null {
    if (!token) return null;
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return null;

    let payload: Buffer;
    let sig: Buffer;
    try {
      payload = Buffer.from(parts[1], "base64url");
      sig = Buffer.from(parts[2], "base64url");
    } catch {
      return null;
    }

    let claims: AssertionClaims;
    try {
      claims = JSON.parse(payload.toString("utf8")) as AssertionClaims;
    } catch {
      return null;
    }
    if (
      typeof claims.sub !== "string" ||
      typeof claims.sid !== "string" ||
      typeof claims.exp !== "number"
    ) {
      return null;
    }

    const key =
      (claims.kid && this.keys.get(claims.kid)) ||
      (claims.kid ? undefined : this.keys.get(this.currentKid));
    if (!key) return null;

    const ok = crypto.verify(null, payload, key, sig);
    if (!ok) return null;

    if (now.getTime() / 1000 > claims.exp + 30) return null; // expiry w/ leeway
    return claims;
  }
}

/**
 * Build an SPKI DER wrapper around a raw Ed25519 public key so Node can import
 * it. RFC 8410 encodes it as `SEQUENCE { algorithm, BIT STRING publicKey }`.
 */
function spkiForRawPublicKey(rawPublicKey: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([
      0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    ]),
    rawPublicKey,
  ]);
}

/** Extracts the raw 32-byte public key from an SPKI DER buffer. */
export function rawPublicFromSpki(spkiDer: Buffer): Buffer {
  return spkiDer.subarray(spkiDer.length - 32);
}
