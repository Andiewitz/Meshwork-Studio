# Secrets & Environment Inventory

> Everything the platform needs to run, where each value is consumed, how to
> generate it, and what happens when it leaks. **Never commit real values** —
> `.env` and `ssh-keys/` are gitignored; keep it that way.

---

## Rules

1. Generate with `openssl rand -base64 32` (or `openssl rand -hex 32`) — never invent strings.
2. Server env files live at `~/meshwork-studiov2/.env`, `chmod 600`, owned by `ubuntu`.
3. Local dev uses one `.env` at repo root (gitignored). The Go service reads the
   same file when started natively.
4. Rotating a key = update every place it appears + restart the owning process.

---

## Node monolith (`~/meshwork-studiov2/.env`)

| Variable                                                       | Purpose                                                 | Consumed by                                          | Rotation / blast radius                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `WORKSPACE_DATABASE_URL`                                       | Workspace Postgres service DSN                          | workspace service connection                         | Leak = workspace data exposure. Rotate DB password in Postgres first, then env.                                                  |
| `TEAM_DATABASE_URL`, `AI_DATABASE_URL`, `METRICS_DATABASE_URL` | Service-specific Postgres DSNs                          | their owning service connections                     | Rotate only the affected service's database password and restart that service.                                                   |
| `REDIS_URL`                                                    | Session cache, WS pub/sub, rate limits                  | `server/lib/redis.ts`                                | Low sensitivity. Flush on rotation (`FLUSHALL`) to drop stale session cache entries.                                             |
| `SESSION_SECRET`                                               | Express-level cookie signing (legacy surface)           | `server/services/auth/config.ts` (`getSecret`)       | Sessions are DB-backed opaque tokens — rotating does **not** log users out. Min 32 chars.                                        |
| `AUTH_ASSERTION_PUBLIC_KEY`                                    | Raw Ed25519 public key for local assertion verification | `server/auth/assertion.ts`                           | Public material only. It must never contain the auth service's private signing seed.                                             |
| `ENCRYPTION_KEY`                                               | AES-256-GCM key for encrypted BYOK provider credentials | `server/services/ai/encryption`                      | Required when BYOK is used. Rotate with a planned re-encryption migration.                                                       |
| `METRICS_BEARER_TOKEN`                                         | Gates `/metrics` on the monolith                        | `server/index.ts` (constant-time compare)            | Rotate anytime; scrapers need the new `Authorization: Bearer …`. Unset = endpoint 404s.                                          |
| `FRONTEND_URL` / `APP_URL`                                     | CORS origin + CSRF allowlist + OAuth redirects          | `server/index.ts`, auth bridge CSRF, identity config | Wrong value = CSRF rejections from the SPA. Not secret; listed here because misconfig looks like an outage.                      |
| `OPENROUTER_API_KEY`, `GEMINI_API_KEY`                         | Free-tier AI provider spend                             | AI service providers                                 | Revoke in provider dashboard; per-user BYOK keys are separate and AES-256-GCM encrypted at rest with the app's own key material. |

Removed (do **not** set): `JWT_SECRET`, anything `E2E_BYPASS_AUTH` — both stacks
refuse/fail closed; their code is gone.

## Go auth service (root `.env` locally; deployment secret store remotely)

| Variable                                                             | Purpose                                                                                         | Consumed by                                                 | Rotation / blast radius                                                                                                                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_DATABASE_URL`                                                  | Auth Postgres DSN (owns this schema)                                                            | `internal/config`, `store.Connect`                          | as `AUTH_DATABASE_URL` above                                                                                                                                                                   |
| `AUTH_REDIS_URL`                                                     | Cache, rate limits, MFA tickets, OAuth state                                                    | `cmd/server/main.go`                                        | Unset = MFA + strict limits disabled (dev only). Flush on rotation.                                                                                                                            |
| `AUTH_IP_HASH_KEY`                                                   | HMAC-SHA256 key pseudonymising IPs (audit, sessions, device alerts)                             | `internal/iphash`                                           | **Required, 32 bytes b64.** Rotating breaks correlation of historical IPs (by design). Quarterly rotation optional.                                                                            |
| `AUTH_ENCRYPTION_KEY`                                                | AES-256-GCM sealbox for TOTP secrets at rest                                                    | `internal/mfa`                                              | **Required, 32 bytes b64.** ⚠️ Rotating requires re-sealing every enrolled user's MFA secret first — write a migration before rotating; otherwise all MFA logins fail until users re-enroll.   |
| `APP_PUBLIC_URL`                                                     | Canonical origin: CSRF allowlist, OAuth redirect base, email links                              | `config.Load`                                               | Must match the public URL exactly (scheme+host).                                                                                                                                               |
| `EXTRA_ALLOWED_ORIGINS`                                              | Additional exact origins allowed to POST                                                        | `csrf.NewAllowlist`                                         | Exact scheme+host only — never wildcards.                                                                                                                                                      |
| `TRUSTED_PROXIES`                                                    | CIDRs allowed to set X-Forwarded-For                                                            | `realIPMiddleware`                                          | Keep tight; spoofable headers must not decide rate-limit keys.                                                                                                                                 |
| `AUTH_ASSERTION_PRIVATE_KEY`                                         | Ed25519 seed signing session assertions; its public half is supplied separately to the monolith | `internal/assertion`                                        | **Required in production.** Leak = ability to forge valid logins on monolith routes → rotate immediately (old public key stays verifiable via `AUTH_ASSERTION_PREVIOUS_KEYS` during rollover). |
| `AUTH_ASSERTION_TTL`                                                 | Assertion lifetime (default 5m)                                                                 | config                                                      | Bounds logout/ban staleness on monolith routes.                                                                                                                                                |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | Transactional email (verify, reset, security alerts)                                            | `internal/email`                                            | Leak = ability to read (not send-as) via relay abuse; rotate at provider. Required in production — boot fails without them.                                                                    |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`                          | Google Sign-In (PKCE flow)                                                                      | `handlers_oauth.go`, also monolith env for legacy redirects | Revoke at Google Cloud Console → rotate → redeploy both processes.                                                                                                                             |
| `CAPTCHA_PROVIDER` / `CAPTCHA_SECRET` / `CAPTCHA_MIN_SCORE`          | Bot defence on registration                                                                     | `internal/captcha`                                          | Rotate at hCaptcha/reCAPTCHA console.                                                                                                                                                          |
| `BOOTSTRAP_ADMIN_EMAILS`                                             | Emails promoted to `is_admin` at boot                                                           | `db.PromoteBootstrapAdmins`                                 | Grants `/admin` dashboard access. Keep minimal.                                                                                                                                                |
| `SESSION_ABSOLUTE_TTL` / `SESSION_IDLE_TTL` / `SESSION_TOUCH_EVERY`  | Session lifetime policy                                                                         | `session.NewStore`                                          | Not secrets; documented for completeness.                                                                                                                                                      |

## SSH access

- `ssh-keys/Mesh-EC2.pem` is the instance keypair. **Untracked by git — verify
  with `git ls-files ssh-keys` returning empty before any push.**
- Permissions must be `chmod 400`. Compromise = full server compromise:
  rotate via AWS EC2 Key Pairs + `~/.ssh/authorized_keys` immediately.
- GitHub-side deploy key lives in repo secret `EC2_SSH_KEY`.

## GitHub Actions secrets

| Secret                                | Used by                                       |
| ------------------------------------- | --------------------------------------------- |
| `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` | `deploy-production.yml`, `deploy-staging.yml` |
| `VITE_API_URL`                        | client build at bundle time                   |

Rotate `EC2_SSH_KEY` whenever anyone with repo-admin access leaves the team.

## Incident quick reference

| Suspected leak         | Do now                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_ENCRYPTION_KEY`  | Treat all MFA seeds exposed → force re-enroll (disable+reenroll), then rotate                                                                        |
| `AUTH_DATABASE_URL`    | Rotate DB password; consider mass session revoke (`UPDATE auth_sessions SET revoked_at=now() WHERE revoked_at IS NULL`) via a temporary admin script |
| `METRICS_BEARER_TOKEN` | Rotate; metrics are informational only                                                                                                               |
| `EC2_SSH_KEY`          | Add new keypair, remove old from `authorized_keys`, update GH secret                                                                                 |
