# Login & sessions — how it works

> Status: active · Updated: 2026-10-12 · Context: the plain-language guide to
> who owns logins and how sessions flow. Full threat-by-threat detail lives in
> [`SECURITY.md`](./SECURITY.md); every secret in
> [`operations/SECRETS.md`](./operations/SECRETS.md).

## The 5-step version

1. You POST email + password. Nginx sends `/api/v1/auth/*` to the **Go auth
   service** (`server/services/auth`, port `:8081`), everything else to the
   **Node app** (`:5000`).
2. Go checks the password (Argon2id) and creates a random 256-bit session
   token. Only a SHA-256 hash of it is stored — the raw token lives in your
   `HttpOnly` cookie.
3. On later requests to Node routes, Go signs a short-lived note ("assertion")
   saying "this user is logged in". Node verifies the signature with a public
   key — it never sees the password database.
4. Logout or ban? Go publishes to Redis; the Node app kills affected live
   (WebSocket) connections immediately, plus re-checks every 5 minutes.
5. Passwords from the old system (bcrypt) still work once, then silently
   upgrade to Argon2id on next login.

## Who owns what

| Job                                                       | Owner                                        | Stored in       |
| --------------------------------------------------------- | -------------------------------------------- | --------------- |
| Users, sessions, CSRF secrets, lockout, MFA, OAuth, audit | **Go auth service** (`server/services/auth`) | `auth_db`       |
| Workspaces, canvas, teams, AI, metrics                    | Node app (`server/`)                         | per-service DBs |
| Live-canvas presence                                      | Node app, checked against login sessions     | —               |

Route split (nginx): `/api/v1/auth/*` + `/api/v1/user/*` → Go `:8081`;
everything else → Node `:5000`. Rollback = point the nginx block back.

## Session facts

- Token: random 256-bit, cookie-only (`HttpOnly`). Re-issued on every login.
- Lifetimes: idle 7 days, absolute 14 days (`SESSION_IDLE_TTL` / `SESSION_ABSOLUTE_TTL`).
- Postgres is the source of truth; Redis caches hot checks for 60s.
- Hashing: Argon2id (64 MiB, 3 passes). Old bcrypt hashes verify once, then upgrade.

## Attack cheat-sheet (headlines)

Full reasoning per row: [`SECURITY.md`](./SECURITY.md).

| Attack                                  | How we stop it                                                              |
| --------------------------------------- | --------------------------------------------------------------------------- |
| Password guessing                       | Lock account after 5 fails (grows to 8h max) + per-IP limits + CAPTCHA hook |
| Figuring out who has an account         | Same reply + same speed whether the email exists or not                     |
| Reused breached passwords               | Checked against HaveIBeenPwned (only 5 hash chars leave the server)         |
| Forged cross-site requests              | Double-submit cookie + server secret + exact origin allowlist               |
| OAuth account theft                     | Google must confirm the email; linking needs your password                  |
| Disabling MFA with a stolen password    | Needs password **plus** current code                                        |
| Replaying one-time tokens               | Single-use at the DB level; new request kills the old family                |
| Snooping on stored IPs                  | Stored as keyed hashes (`AUTH_IP_HASH_KEY`), never raw                      |
| Quietly weakening when Redis/DB is down | No silent fallbacks: auth fails closed instead of dropping protections      |

## Admins, metrics, CI

- `/admin` needs `users.is_admin = true`. First admins come from
  `BOOTSTRAP_ADMIN_EMAILS` at boot. (The old secret-in-URL gate was removed —
  URLs leak into logs.)
- Metrics: Go on loopback-only `127.0.0.1:9091/metrics`; Node `/metrics` needs
  `Authorization: Bearer $METRICS_BEARER_TOKEN`.
- CI (`auth.yml`): Go lint, security scan, race tests, docker build.
  `scripts/no-auth-bypass.sh` fails the pipeline if `E2E_BYPASS_AUTH` ever
  returns to runtime code.

## Switching versions (cutover & rollback)

1. Deploy (migrations only add; old sessions and hashes keep working).
2. Nginx sends auth routes to Go. Existing cookies work on both sides — both
   validate the same hashed tokens.
3. Rollback: point nginx back at Node. Sessions from either side stay valid.

## Secrets

No defaults, no fallbacks — production refuses to boot without real values.
Generate with `openssl rand -base64 32`. The complete table (what each key
does, who reads it, how to rotate): [`operations/SECRETS.md`](./operations/SECRETS.md).
One rule that bites: the auth service's `AUTH_ASSERTION_PRIVATE_KEY` and the
app's `AUTH_ASSERTION_PUBLIC_KEY` must be generated as **one pair**.
