# Security Audit & Fixes Report

## Date: March 25, 2026

This document outlines the security audit performed on the Meshwork-Studio codebase and the fixes implemented.

---

## 🔴 CRITICAL ISSUES FIXED

### 1. ✅ Credentials in .env File (RESOLVED)

- **Issue**: `.env` file was committed to git with production database credentials
- **Fix Applied**:
  - Removed `.env` from git tracking using `git rm --cached .env`
  - Updated `.gitignore` to exclude all `.env*` files
  - Credentials must be rotated immediately (see "Immediate Actions" below)

### 2. ✅ Backup Folder with Credentials (RESOLVED)

- **Issue**: `backup/` folder contained backup copies of `.env` with credentials
- **Fix Applied**:
  - Deleted all backup files
  - Added `backup/` to `.gitignore`

### 3. ✅ Weak Session Secret Fallback (RESOLVED)

- **Issue**: Sessions could be forged if `SESSION_SECRET` was not set
- **Fix Applied**:
  - Added validation in `authCore.ts` to throw error in production if `SESSION_SECRET` not set
  - Changed development-only fallback to less obvious value
  - Added warning message when using development fallback

### 4. ✅ Insecure Session Cookie Settings (RESOLVED)

- **Issue**: `sameSite="none"` increased CSRF vulnerability
- **Fix Applied**:
  - Changed to `sameSite="lax"` for CSRF protection while maintaining OAuth compatibility
  - Note: `"strict"` would break Google OAuth redirect-back flow (Passport cannot restore the session). `"lax"` is the correct setting for apps using OAuth providers.
  - Made `secure` flag conditional based on `NODE_ENV`
  - CSRF protection is additionally enforced via `csurf` tokens on all state-changing endpoints

---

## 🟠 HIGH SEVERITY ISSUES FIXED

### 1. ✅ .gitignore Missing Sensitive Files (RESOLVED)

- **Issue**: No protection for `.env`, `.env.local`, backup files, etc.
- **Fix Applied**:
  ```
  Added to .gitignore:
  - .env
  - .env.local
  - .env.*.local
  - .env.production.local
  - backup/
  - .vscode/settings.json
  - *.swp, *.swo, *~
  - logs/
  - coverage/
  ```

### 2. ✅ Weak Password Requirements (RESOLVED)

- **Issue**: Minimum 8 characters with no complexity requirements
- **Fix Applied**:
  - Implemented `validatePasswordStrength()` function in `password.ts`
  - New requirements:
    - Minimum 12 characters (increased from 8)
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one number
    - At least one special character
  - Applied validation on registration endpoint

### 3. ✅ Debug Logs Exposing Auth Info (RESOLVED)

- **Issue**: Console logs revealed email addresses and authentication attempts
- **Fix Applied**:
  - Removed all sensitive debug logs from `strategies/local.ts`
  - Replaced with generic error messages to prevent email enumeration
  - Kept only non-sensitive error logging

### 4. ✅ Missing CORS Configuration in Development (RESOLVED)

- **Issue**: No CORS protection in development environment
- **Fix Applied**:
  - Applied CORS policy in all environments
  - Development defaults to `http://localhost:5173`
  - Production requires `FRONTEND_URL` env variable

### 5. ✅ Missing Security Headers (RESOLVED)

- **Issue**: No helmet middleware for security headers
- **Fix Applied**:
  - Installed `helmet` package
  - Added `app.use(helmet())` to enforce:
    - Content-Security-Policy
    - X-Frame-Options
    - X-Content-Type-Options
    - Strict-Transport-Security
    - And 15+ other security headers

### 6. ✅ Missing Request Size Limits (RESOLVED)

- **Issue**: No protection against DoS via large payloads
- **Fix Applied**:
  - Added `limit: "5mb"` to JSON middleware
  - Added `limit: "5mb"` to URL-encoded middleware

---

## 🟡 MEDIUM SEVERITY ISSUES (Recommendations)

### 1. ✅ No CSRF Protection Tokens (IMPLEMENTED)

- **Status**: IMPLEMENTED
- **Solution Applied**:
  - Installed `csurf` middleware for CSRF token protection
  - Created `server/middleware/csrf.ts` with token generation and validation
  - Implemented `/api/csrf-token` endpoint for client to fetch tokens
  - Applied CSRF protection to all state-changing endpoints:
    - `POST /api/auth/register` - with CAPTCHA + CSRF
    - `POST /api/auth/login` - with CSRF
    - `POST /api/user/change-password` - with CSRF
    - `DELETE /api/user/data` - with CSRF
    - `DELETE /api/user/account` - with CSRF
    - `POST /api/collections/*` - with CSRF
    - `PUT /api/collections/:id` - with CSRF
    - `DELETE /api/collections/:id` - with CSRF
    - `POST /api/workspaces/create` - with CSRF
    - `PUT /api/workspaces/:id` - with CSRF
    - `DELETE /api/workspaces/:id` - with CSRF
    - `POST /api/workspaces/:id/duplicate` - with CSRF
    - `POST /api/workspaces/:id/sync-canvas` - with CSRF
    - `POST /api/workspaces/:id/duplicate-canvas` - with CSRF
    - `POST /api/v1/ai/keys` - with CSRF
    - `DELETE /api/v1/ai/keys/:id` - with CSRF
    - `POST /api/v1/ai/keys/:id/toggle` - with CSRF
    - `POST /api/v1/ai/chat` - with CSRF
    - `POST /api/v1/ai/suggestions` - with CSRF

- **CSRF Development Mode**:
  - CSRF is automatically active in production (`NODE_ENV=production`)
  - In development, CSRF is disabled by default for ease of testing
  - Set `ENABLE_CSRF=true` in `.env` to enable CSRF locally for integration testing
  - This behavior is configurable, not hardcoded to `NODE_ENV`

- **Implementation Details**:
  - Double-submit cookie pattern (CSRF token stored in secure HttpOnly cookie + header)
  - Token validation on all state-changing requests
  - Token sent via `X-CSRF-Token` header (API) or `_csrf` body field (forms)
  - Client-side utilities: `useCsrfToken()` and `secureFetch()` for automatic token inclusion
  - CSRF token initialization on app load via `useCsrfTokenInitializer()`

- **Client Integration**:
  - `client/src/hooks/use-csrf-token.ts` - React hook for token management
  - `client/src/lib/secure-fetch.ts` - Enhanced fetch wrapper with automatic CSRF inclusion
  - `client/src/lib/csrf-init.ts` - Initialization hook for app startup

- **Priority**: HIGH (now complete)

### 2. ✅ Account Lockout on Failed Attempts

- **Status**: IMPLEMENTED
- **Solution Applied**:
  - Created `server/modules/auth/lockout.ts` service with exponential backoff
  - Added `login_attempts` table to track failed attempts per email
  - Lock threshold: 5 failed attempts
  - Exponential backoff lockout duration:
    - 6th attempt: 15 minutes
    - 7th attempt: 30 minutes
    - 8th attempt: 60 minutes
    - 9th+ attempts: cap at 8 hours max
  - Automatic unlock after lockout duration expires
  - Counter resets on successful login
  - Integration in local.ts strategy checks lockout before password verification
  - Client receives `locked_until` timestamp in error response for UI feedback

- **Files Modified/Created**:
  - `shared/schema.ts` - Added loginAttempts table
  - `server/modules/auth/db.ts` - Added table creation
  - `server/modules/auth/lockout.ts` - New service module
  - `server/modules/auth/strategies/local.ts` - Integrated lockout checks
  - `server/modules/auth/routes.ts` - Enhanced login response with lockout info

- **Priority**: HIGH (now complete)

### 3. ✅ Rate Limiting (IMPLEMENTED)

- **Status**: Implemented
- **Solution Applied**:
  - Installed `express-rate-limit`
  - Applied strict limits to:
    - `/api/v1/auth/login` - 10 attempts per 15 minutes per IP
    - `/api/v1/auth/register` - 10 per 15 minutes per IP
    - `/api/v1/auth/refresh` - 100 per hour per IP
    - `/api/v1/ai/chat` - 30 per minute per IP
  - Global API limiter: 100 requests per minute per IP

### 4. ⚠️ No MFA/2FA Implementation

- **Status**: Not implemented
- **Recommendation**:
  - Implement TOTP (Time-based One-Time Password)
  - Use `speakeasy` or `otplib` packages
  - Make optional for users initially

### 5. ⚠️ Verbose Error Messages

- **Status**: Partially fixed
- **Recommendation**:
  - Audit error messages to ensure they don't reveal auth methods
  - Use consistent generic messages like "Invalid credentials"

---

## 🟢 POSITIVE SECURITY FINDINGS

✅ **Passwords hashed with bcrypt** (salt rounds: 12, increased from 10)
✅ **HttpOnly cookies enabled** (prevents XSS token theft)
✅ **Session storage in PostgreSQL** (not in-memory in production)
✅ **OAuth integration with Google**
✅ **CAPTCHA protection on registration**
✅ **Using Drizzle ORM** (prevents SQL injection)
✅ **Zod validation** (type-safe input validation)
✅ **TypeScript** (type safety throughout)

---

## 🚨 IMMEDIATE ACTIONS REQUIRED

### ⚠️ CRITICAL - Before Deployment:

1. **Rotate ALL Database Credentials**

   ```bash
   # The following credentials were exposed and MUST be changed:
   # - PostgreSQL databases (emnesh_workspace, emnesh_auth)
   # - All user accounts with these permissions
   ```

2. **SSH Keys & Deployment Keys**
   - If any deployment keys have SSH access, regenerate them
   - Check git log for `.env` history: `git log --all --full-history -- .env`

3. **Environment Variables Setup**

   ```bash
   # Create proper .env file on deployment server with:
   DATABASE_URL=postgresql://new_user:new_password@host:port/db
   WORKSPACE_DATABASE_URL=postgresql://...
   AUTH_DATABASE_URL=postgresql://...
   SESSION_SECRET=<generate-secure-random-32-char-string>
   FRONTEND_URL=https://yourdomain.com
   ```

4. **Audit Git History**
   ```bash
   # Check if credentials were ever committed
   git log -p --all | grep -i "password\|secret\|key\|credential"

   # If found, rewrite history (destructive, coordination needed):
   git filter-branch --tree-filter 'rm -f .env' -- --all
   ```

---

## 📋 Configuration Checklist

- [ ] Environment variables set in production deployment
- [ ] DATABASE_URL rotated (new credentials)
- [ ] SESSION_SECRET set to strong random value
- [ ] FRONTEND_URL configured correctly
- [ ] CORS origin verified
- [ ] SSL/TLS certificate valid
- [ ] Helmet headers verified in browser dev tools
- [ ] Password policy tested with weak passwords
- [ ] .env file never accidentally committed again

---

## 🔍 Testing Security Changes

### 1. Test Password Validation

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"weak"}'
# Should return error about password requirements
```

### 2. Test Security Headers

```bash
curl -I http://localhost:5000
# Should include headers like Strict-Transport-Security, X-Frame-Options
```

### 3. Test CORS

```bash
# From different origin - should respect CORS policy
curl -H "Origin: https://evil.com" http://localhost:5000/api/auth/me
```

### 4. Test Session Cookie

```bash
curl -I http://localhost:5000 -X POST /api/auth/login
# Cookie should have: HttpOnly, Secure (in prod), SameSite=Strict
```

### 5. Test Account Lockout

```bash
# First, register a test account if needed
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"locktest@example.com","password":"StrongPass123!"}'

# Make 5 failed login attempts
for i in {1..5}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"locktest@example.com","password":"WrongPassword"}' \
    -H "X-CSRF-Token: your_csrf_token"
done

# 6th attempt should return locked message with locked_until timestamp
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"locktest@example.com","password":"WrongPassword"}' \
  -H "X-CSRF-Token: your_csrf_token"
# Response: {"message":"Account temporarily locked...","locked_until":"2026-03-25T..."}

# Even correct password won't work while locked
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"locktest@example.com","password":"StrongPass123!"}' \
  -H "X-CSRF-Token: your_csrf_token"

# After lockout expires (15 min default), login succeeds with correct password
# and the attempt counter resets
```

---

## 📚 References & Standards

- OWASP Top 10 (2021): https://owasp.org/www-project-top-ten/
- NIST Password Guidelines: https://pages.nist.gov/800-63-3/sp800-63b.html
- CWE Top 25: https://cwe.mitre.org/top25/
- Node.js Security Best Practices: https://nodejs.org/en/docs/guides/security/

---

## 👤 Audit Performed By

GitHub Copilot - March 25, 2026

---

## 📝 Notes

All fixes have been applied to the codebase. The most critical issue (exposed credentials in git) has been handled by unstaging the `.env` file. However, **credentials must still be rotated** in all systems since they were in the git history.

Future deployments should use environment-based configuration management (e.g., EC2 environment variables or secrets managers) rather than .env files.
