# Security Architecture

> A complete guide to every security layer protecting Meshwork Studio — from the browser to the database.

**Last Updated:** April 2, 2026

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Authorization & Access Control](#authorization--access-control)
4. [Brute-Force Protection](#brute-force-protection)
5. [API Key Encryption (BYOK)](#api-key-encryption-byok)
6. [Input Validation](#input-validation)
7. [Network Security](#network-security)
8. [Logging & PII Protection](#logging--pii-protection)
9. [Environment Security](#environment-security)
10. [For Developers](#for-developers)

---

## Overview

Meshwork Studio implements a **defense-in-depth** security model. No single layer is responsible for safety — if one fails, the others catch it.

```
┌─────────────────────────────────────────────────────────────────┐
│                        REQUEST LIFECYCLE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Browser ──► NGINX ──► Helmet Headers ──► Rate Limiter           │
│                              │                                   │
│                              ▼                                   │
│                    CSRF Token Check ──► Session Validation        │
│                              │                                   │
│                              ▼                                   │
│                    Zod Schema Validation ──► IDOR Check           │
│                              │                                   │
│                              ▼                                   │
│                    Drizzle ORM (Parameterized SQL)                │
│                              │                                   │
│                              ▼                                   │
│                    PostgreSQL (Data at Rest)                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Authentication

### Multi-Strategy Login

Users can authenticate via two methods, handled by [Passport.js](http://www.passportjs.org/):

| Strategy             | How It Works                                          | When It's Used                |
| -------------------- | ----------------------------------------------------- | ----------------------------- |
| **Local**            | Email + password with bcrypt hashing (12 salt rounds) | Users who register directly   |
| **Google OAuth 2.0** | Redirect to Google, receive profile back              | Users who prefer social login |

### Session Management

After authentication, a session is created and stored server-side:

| Setting     | Value                                          | Why                                                                  |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------- |
| `httpOnly`  | `true`                                         | JavaScript cannot read the session cookie (prevents XSS token theft) |
| `sameSite`  | `strict`                                       | Cookie only sent from the same origin (prevents CSRF)                |
| `secure`    | `true` (production)                            | Cookie only sent over HTTPS                                          |
| `maxAge`    | 7 days                                         | Balanced between convenience and security                            |
| **Storage** | PostgreSQL (production) / Memory (development) | Sessions survive server restarts in production                       |

### Password Requirements

- Minimum 12 characters
- At least one uppercase letter, one lowercase letter, one number, one special character
- Validated server-side in `server/modules/auth/password.ts`

### CAPTCHA

CAPTCHA is required for **registration only** — returning users shouldn't be punished for being loyal.

The implementation includes enterprise features most apps skip:

- **Replay protection**: Each CAPTCHA token can only be used once (tracked server-side)
- **Token expiration**: Tokens expire after 5 minutes
- **Score thresholds**: reCAPTCHA v3 scores below 0.5 are rejected
- **Graceful degradation**: If no CAPTCHA keys are configured, verification is skipped in development

---

## Authorization & Access Control

### IDOR Protection (Insecure Direct Object Reference)

Every data-modifying endpoint verifies that the authenticated user actually **owns** the resource they're trying to access. This prevents User A from modifying User B's workspaces by guessing IDs.

**How it works in practice:**

```
User A sends: PUT /api/workspaces/42  { title: "Hacked" }

Server checks:
  1. Does workspace 42 exist?              → No?  Return 404
  2. Does workspace 42 belong to User A?   → No?  Return 401
  3. Is the payload valid (Zod)?           → No?  Return 400
  4. All good?                             → Update and return 200
```

This pattern is enforced on **every** workspace, collection, and canvas endpoint. Our integration tests actively verify this by simulating cross-user access attempts.

### CSRF Protection

State-changing requests (POST, PUT, DELETE) require a valid CSRF token in the `X-CSRF-Token` header. The token is fetched from `/api/csrf-token` and automatically included by the `secureFetch()` client utility.

**Protected endpoints:** 15 routes across auth, workspace, and canvas modules.

### `secureFetch` — Client-Side CSRF Automation

**File:** `client/src/lib/secure-fetch.ts`

All state-changing fetch calls in the app go through `secureFetch` instead of the native `fetch`. It's a drop-in replacement with one extra behaviour: it automatically injects the CSRF token header.

```typescript
// Usage is identical to fetch()
const res = await secureFetch("/api/workspaces", {
  method: "POST",
  body: JSON.stringify(data),
});
```

**How it works:**

```
secureFetch called with POST/PUT/DELETE
        │
        ▼
Read CSRF token from sessionStorage["csrfToken"]
        │
        ▼
Inject X-CSRF-Token header into the request
        │
        ▼
Forward to native fetch() — response returned as-is
```

**Why `sessionStorage`, not `localStorage`?**

The CSRF token is intentionally tab-scoped. `sessionStorage` is cleared when the browser tab closes. This means:

- A tab opened from a phishing link cannot read another tab's CSRF token
- Closing and reopening a tab forces a fresh token fetch (from `/api/csrf-token`)
- Multiple open tabs each have their own independent CSRF token

**Token lifecycle:**

| Event                    | Effect                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------- |
| App loads / user logs in | `use-csrf-token.ts` fetches token from `/api/csrf-token`, calls `storeCsrfToken()` |
| State-changing request   | `secureFetch` reads from sessionStorage and injects header                         |
| User logs out            | `clearCsrfToken()` removes token from sessionStorage                               |
| Tab closed               | sessionStorage cleared automatically by browser                                    |

---

## Brute-Force Protection

### Account Lockout System

After too many failed login attempts, the account is temporarily locked with **progressive delays**:

| Failed Attempts | What Happens                    |
| --------------- | ------------------------------- |
| 1–5             | Normal login allowed            |
| 6               | Account locked for **1 minute** |
| 7               | Locked for **5 minutes**        |
| 8               | Locked for **15 minutes**       |
| 9               | Locked for **30 minutes**       |
| 10+             | Locked for **60 minutes**       |

- Lockout state is tracked per email in the `login_attempts` table
- Successful login resets the counter to zero
- Lockout expiration is checked automatically — users don't need to do anything except wait

### Rate Limiting

Two tiers of rate limiting protect against automated attacks:

| Limiter          | Scope                 | Limit        | Window     |
| ---------------- | --------------------- | ------------ | ---------- |
| **API Limiter**  | All `/api/` routes    | 100 requests | 1 minute   |
| **Auth Limiter** | Login & register only | 10 requests  | 15 minutes |

Both are implemented with `express-rate-limit` and return standard `429 Too Many Requests` responses.

---

## API Key Encryption (BYOK)

Users can bring their own AI provider keys (OpenAI, Anthropic, Google) to power AI-assisted architecture generation. These keys are **never stored in plaintext**.

### Encryption Flow

```
User submits API key
        │
        ▼
Server generates random 16-byte IV
        │
        ▼
AES-256-GCM encrypts the key
using master key + IV
        │
        ▼
Encrypted blob + IV + Auth Tag
stored in PostgreSQL
        │
        ▼
Original key cleared from memory
```

### Decryption Flow (On AI Request)

```
User triggers AI chat
        │
        ▼
Server fetches encrypted key from DB
        │
        ▼
Decrypts in memory using master key + stored IV
        │
        ▼
Forwards request to AI provider (OpenAI/Anthropic)
        │
        ▼
Streams response back to user
        │
        ▼
Clears decrypted key from memory
```

### Security Properties

| Property           | Implementation                                                      |
| ------------------ | ------------------------------------------------------------------- |
| **Algorithm**      | AES-256-GCM (authenticated encryption)                              |
| **Key length**     | 256-bit master key (32 bytes, base64 encoded)                       |
| **IV**             | Unique 16-byte random IV per encryption (prevents pattern analysis) |
| **Auth tag**       | 16-byte GCM tag (detects tampering)                                 |
| **Key hint**       | Only last 4 characters shown in UI (`...wxyz`)                      |
| **Key validation** | Format-checked per provider before storage                          |

The master encryption key is loaded from the `ENCRYPTION_KEY` environment variable. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## Input Validation

### Defense in Depth

User input is validated at **four independent layers**. If any layer is bypassed, the next one catches it:

```
┌─────────────────────────────────────────────────┐
│  Layer 1: Client-Side (UX Feedback)             │
│  • Max 16 character limit in real-time          │
│  • Emoji detection with visual red border       │
│  • Instant feedback as user types               │
├─────────────────────────────────────────────────┤
│  Layer 2: Zod Schema (Server Validation)        │
│  • Strict type checking                         │
│  • Regex pattern: letters, numbers, _ - only    │
│  • Custom error messages returned to client     │
├─────────────────────────────────────────────────┤
│  Layer 3: Drizzle ORM (Query Safety)            │
│  • All queries are parameterized                │
│  • Zero raw SQL in application code             │
│  • SQL injection is structurally impossible     │
├─────────────────────────────────────────────────┤
│  Layer 4: React (Output Encoding)               │
│  • Automatic XSS escaping on render             │
│  • No dangerouslySetInnerHTML usage             │
└─────────────────────────────────────────────────┘
```

---

## Network Security

### HTTP Security Headers (Helmet)

Applied globally via `helmet` middleware:

| Header                      | Value                    | Protection                        |
| --------------------------- | ------------------------ | --------------------------------- |
| `Content-Security-Policy`   | Restricts script sources | XSS mitigation                    |
| `X-Frame-Options`           | `SAMEORIGIN`             | Prevents clickjacking             |
| `X-Content-Type-Options`    | `nosniff`                | Prevents MIME sniffing            |
| `Strict-Transport-Security` | 1 year                   | Forces HTTPS                      |
| `Referrer-Policy`           | Strict                   | Protects user privacy             |
| `Permissions-Policy`        | Restricted               | Disables camera, mic, geolocation |

### CORS Configuration

| Environment | Allowed Origin             | Credentials |
| ----------- | -------------------------- | ----------- |
| Development | `http://localhost:5173`    | Yes         |
| Production  | `process.env.FRONTEND_URL` | Yes         |

### Request Size Limits

- JSON body: **5MB** maximum
- URL-encoded body: **5MB** maximum
- Prevents memory exhaustion from oversized payloads

---

## Logging & PII Protection

### Sanitized Production Logs

In production, the global request logger **actively redacts sensitive data** before writing to stdout. This prevents accidental PII leakage in log aggregation services (Datadog, CloudWatch, etc.).

**Redacted fields:** `email`, `password`, `token`, `passwordHash`, `apiKey`, `secret`

```
// What gets logged in production:
POST /api/auth/login 200 in 45ms :: {"user":{"email":"[REDACTED]","id":"abc123"}}

// What gets logged in development (full detail for debugging):
POST /api/auth/login 200 in 45ms :: {"user":{"email":"test@example.com","id":"abc123"}}
```

The redaction function recursively traverses nested objects, so even deeply nested sensitive fields are caught.

### Error Message Philosophy

| Scenario                           | What the User Sees              | Why                         |
| ---------------------------------- | ------------------------------- | --------------------------- |
| Wrong password                     | "Invalid email or password"     | Prevents email enumeration  |
| User not found                     | "Invalid email or password"     | Same message — no info leak |
| OAuth account tries password login | "Invalid email or password"     | Doesn't reveal auth method  |
| Account locked                     | "Account temporarily locked..." | Tells user what to do       |

---

## Environment Security

### Required Variables

| Variable         | Required In        | Purpose                                            |
| ---------------- | ------------------ | -------------------------------------------------- |
| `SESSION_SECRET` | Production         | Session cookie signing (server crashes without it) |
| `ENCRYPTION_KEY` | When using BYOK AI | AES-256 master key for API key encryption          |
| `DATABASE_URL`   | Production         | PostgreSQL connection string                       |

### Fail-Safe Defaults

- Missing `SESSION_SECRET` in production → **Server refuses to start** (hard crash with clear error)
- Missing `SESSION_SECRET` in development → Warning logged, insecure default used
- Missing `ENCRYPTION_KEY` → AI key storage throws error, but app continues running
- Missing CAPTCHA keys → Verification skipped in development, enforced in production

### What's in `.gitignore`

```
.env
.env.*
.env.production.local
.env.development.local
coverage/
backup/
logs/
```

---

## For Developers

### Do This ✅

```typescript
// Use secureFetch for all state-changing requests
import { secureFetch } from "@/lib/secure-fetch";
const res = await secureFetch("/api/workspaces", {
  method: "POST",
  body: JSON.stringify(data),
});

// Use req.user!.id (type-safe, backed by Express.User declaration)
const userId = req.user!.id;

// Validate input with Zod before touching the database
const input = api.workspaces.create.input.parse(req.body);

// Check ownership on every data-modifying route
if (workspace.userId !== userId)
  return res.status(401).json({ message: "Unauthorized" });
```

### Don't Do This ❌

```typescript
// Don't log sensitive data
console.log(`User logged in: ${email}`); // ❌ Leaks PII
console.log(`User authentication processed`); // ✅ Safe

// Don't use raw SQL
db.execute(`SELECT * FROM users WHERE id = '${userId}'`); // ❌ SQL injection
db.select().from(users).where(eq(users.id, userId)); // ✅ Parameterized

// Don't cast req.user unsafely
const userId = (req.user as any).id; // ❌ No type safety
const userId = req.user!.id; // ✅ Backed by express.d.ts declaration

// Don't skip IDOR checks
app.put("/api/workspaces/:id", async (req, res) => {
  await storage.updateWorkspace(id, req.body); // ❌ Anyone can update anything
});
```

---

## Key Files

| File                                       | Purpose                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| `server/modules/auth/authCore.ts`          | Session setup, Passport initialization               |
| `server/modules/auth/strategies/local.ts`  | Email/password authentication                        |
| `server/modules/auth/strategies/google.ts` | Google OAuth 2.0 authentication                      |
| `server/modules/auth/lockout.ts`           | Brute-force protection with progressive delays       |
| `server/modules/auth/captcha.ts`           | CAPTCHA verification with replay protection          |
| `server/modules/auth/password.ts`          | Password hashing and strength validation             |
| `server/modules/ai/encryption.ts`          | AES-256-GCM API key encryption                       |
| `server/middleware/csrf.ts`                | CSRF token generation and validation                 |
| `server/middleware/rateLimit.ts`           | API and auth rate limiters                           |
| `server/types/express.d.ts`                | Global Express.User type augmentation                |
| `server/index.ts`                          | Helmet headers, CORS, request logging, PII redaction |
