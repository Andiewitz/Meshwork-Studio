import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import {
  initAuth,
  requireAuth,
  optionalAuth,
  csrfProtect,
  revokedSessions,
} from "../../../server/auth";

/**
 * Auth middleware contract tests.
 *
 * Identity is owned by the Go service (server/services/auth + its Go tests). These
 * suites pin what the MONOLITH enforces locally:
 *   - ed25519 assertion verification (signature, expiry, tamper, rotation)
 *   - revocation denylist
 *   - CSRF origin allowlist / double-submit on monolith mutations
 */

// ─── key helpers (mirror of the Go signer's wire format) ────────────────────

function generateSeed(): string {
  return crypto.randomBytes(32).toString("base64");
}

/** Raw ed25519 public key (32 bytes) derived from a base64 seed. */
function publicKeyFromSeed(seedB64: string): Buffer {
  const seed = Buffer.from(seedB64, "base64");
  const priv = crypto.createPrivateKey({
    key: pkcs8ForSeed(seed),
    format: "der",
    type: "pkcs8",
  });
  const spki = crypto
    .createPublicKey(priv)
    .export({ format: "der", type: "spki" });
  return spki.subarray(spki.length - 32);
}

function pkcs8ForSeed(seed: Buffer): Buffer {
  const innerSeed = Buffer.concat([Buffer.from([0x04, 0x20]), seed]);
  const alg = Buffer.from([0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70]);
  const version = Buffer.from([0x02, 0x01, 0x00]);
  const body = Buffer.concat([
    version,
    alg,
    Buffer.from([0x04, innerSeed.length]),
    innerSeed,
  ]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

interface Claims {
  sub: string;
  sid: string;
  adm: boolean;
  exp: number;
  kid?: string;
  eml?: string;
  nam?: string;
}

function signToken(seedB64: string, claims: Claims): string {
  const seed = Buffer.from(seedB64, "base64");
  const priv = crypto.createPrivateKey({
    key: pkcs8ForSeed(seed),
    format: "der",
    type: "pkcs8",
  });
  // kid must match what the Go signer and verifier derive from the raw public key
  const spki = crypto
    .createPublicKey(priv)
    .export({ format: "der", type: "spki" });
  const rawPub = spki.subarray(spki.length - 32);
  claims.kid = crypto
    .createHash("sha256")
    .update(rawPub)
    .digest("hex")
    .slice(0, 8);

  const payload = Buffer.from(JSON.stringify(claims));
  const sig = crypto.sign(null, payload, priv);
  return `v1.${payload.toString("base64url")}.${sig.toString("base64url")}`;
}

const SEED = generateSeed();

process.env.AUTH_ASSERTION_PUBLIC_KEY =
  publicKeyFromSeed(SEED).toString("base64");
delete process.env.AUTH_ASSERTION_PREVIOUS_KEYS;
process.env.AUTH_INTERNAL_KEY = "test-internal-key";
process.env.AUTH_SERVICE_URL = "http://auth-service.test";

// ─── app under test ────────────────────────────────────────────────────────

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  initAuth();
  app.use(optionalAuth);

  app.get("/api/v1/auth/session", requireAuth, (req, res) => {
    res.json({
      user:
        (req as express.Request & { auth?: { user: unknown } }).auth?.user ??
        null,
    });
  });

  app.get("/optional", optionalAuth, (req, res) => {
    res.json({
      user:
        (req as express.Request & { auth?: { user: unknown } }).auth?.user ??
        null,
    });
  });

  app.post("/api/v1/thing", csrfProtect, (_req, res) => res.json({ ok: true }));
  return app;
};

let app: express.Express;

beforeEach(() => {
  app = buildApp();
});

function mint(
  overrides: Partial<Claims> = {},
  seedB64 = SEED,
  now = Date.now(),
): string {
  return signToken(seedB64, {
    sub: "user-1",
    sid: "session-hash-1",
    adm: false,
    exp: Math.floor(now / 1000) + 240,
    eml: "user@example.com",
    nam: "User",
    ...overrides,
  });
}

const authCookie = (token: string) => `meshwork_assertion=${token}`;

describe("assertion middleware", () => {
  it("accepts_a_valid_assertion_and_populates_req_user", async () => {
    const res = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", authCookie(mint()));

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      id: "user-1",
      email: "user@example.com",
      isAdmin: false,
    });
  });

  it("rejects_missing_assertion_with_401", async () => {
    expect((await request(app).get("/api/v1/auth/session")).status).toBe(401);
  });

  it("rejects_expired_assertion_with_401", async () => {
    const token = mint({ exp: Math.floor(Date.now() / 1000) - 120 });
    const res = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", authCookie(token));
    expect(res.status).toBe(401);
  });

  it("rejects_assertions_signed_by_a_different_key", async () => {
    const strangerToken = mint({}, generateSeed());
    const res = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", authCookie(strangerToken));
    expect(res.status).toBe(401);
  });

  it("rejects_tampered_assertions", async () => {
    const good = mint();
    const tampered = good.slice(0, -4) + "AAAA";
    const res = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", authCookie(tampered));
    expect(res.status).toBe(401);
  });

  it("rejects_assertions_on_the_revocation_denylist", async () => {
    const token = mint({ sid: "revoked-session-hash" });
    revokedSessions.add("revoked-session-hash");

    const res = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", authCookie(token));
    expect(res.status).toBe(401);
  });

  it("expired_assertion_with_valid_session_introspects_and_refreshes", async () => {
    const freshAssertion = mint({ exp: Math.floor(Date.now() / 1000) + 240 });
    const fetchMock = vi.fn(async (_url: any, opts: any) => ({
      ok: true,
      status: 200,
      json: async () => ({
        active: true,
        sub: "user-1",
        sid: "session-hash-1",
        adm: false,
        eml: "user@example.com",
        nam: "User",
        assertion: freshAssertion,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const expired = mint({ exp: Math.floor(Date.now() / 1000) - 60 });
    const res = await request(app)
      .get("/api/v1/auth/session")
      .set(
        "Cookie",
        [
          authCookie(expired),
          "meshwork_session=opaque-session-token-value",
        ].join("; "),
      );

    vi.unstubAllGlobals();

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("user-1");
    // Fresh assertion relayed back to the browser:
    const setCookie = ([] as string[])
      .concat(res.headers["set-cookie"] ?? [])
      .join(";");
    expect(setCookie).toContain("meshwork_assertion=");
    // Introspection carried the shared internal key:
    expect(fetchMock.mock.calls[0][1].headers["X-Internal-Key"]).toBe(
      "test-internal-key",
    );
  });

  it("introspection_says_inactive → 401 (fail closed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ active: false }),
      })),
    );

    const expired = mint({ exp: Math.floor(Date.now() / 1000) - 60 });
    const res = await request(app)
      .get("/api/v1/auth/session")
      .set(
        "Cookie",
        [authCookie(expired), "meshwork_session=revoked-opaque-token"].join(
          "; ",
        ),
      );

    vi.unstubAllGlobals();
    expect(res.status).toBe(401);
  });

  it("introspection_transport_failure_fails_closed_401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const expired = mint({ exp: Math.floor(Date.now() / 1000) - 60 });
    const res = await request(app)
      .get("/api/v1/auth/session")
      .set(
        "Cookie",
        [authCookie(expired), "meshwork_session=some-opaque-token"].join("; "),
      );

    vi.unstubAllGlobals();
    expect(res.status).toBe(401);
  });

  it("valid_assertion_short_circuits_no_introspection_call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", authCookie(mint()));

    vi.unstubAllGlobals();
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("optionalAuth_leaves_anonymous_requests_through_untouched", async () => {
    const res = await request(app).get("/optional");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });
});

describe("monolith csrf", () => {
  const csrfPair = ["csrf-cookie-value", "csrf-cookie-value"];

  function post(path: string, headers: Record<string, string>) {
    return request(app).post(path).set(headers);
  }

  it("rejects_mutation_without_origin_and_tokens", async () => {
    expect((await post("/api/v1/thing", {})).status).toBe(403);
  });

  it("accepts_mutation_from_allowed_origin_with_matching_double_submit", async () => {
    const res = await post("/api/v1/thing", {
      Origin: "http://localhost:5173",
      Cookie: `meshwork_csrf=${csrfPair[0]}`,
      "X-CSRF-Token": csrfPair[1],
    });
    expect(res.status).toBe(200);
  });

  it("rejects_evil_origins_even_with_valid_token_pair", async () => {
    const res = await post("/api/v1/thing", {
      Origin: "https://meshwork.evil.com",
      Cookie: `meshwork_csrf=${csrfPair[0]}`,
      "X-CSRF-Token": csrfPair[1],
    });
    expect(res.status).toBe(403);
  });

  it("fails_closed_when_cookies_present_but_no_origin_signal", async () => {
    const res = await post("/api/v1/thing", {
      Cookie: [
        `meshwork_csrf=${csrfPair[0]}`,
        "meshwork_session=somesessionvalue123",
      ].join("; "),
      "X-CSRF-Token": csrfPair[1],
    });
    expect(res.status).toBe(403);
  });
});
