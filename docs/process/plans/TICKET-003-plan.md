# Implementation Plan: TICKET-003 (Nodemailer API Typo Fix)

## Decision & Strategy

**Refactor typo** (Conditional). If TICKET-001 (Email Verification Removal) is APPROVED, this entire module (`server/modules/auth/email.ts`) will be deleted to clean up unused orphan code.

If Andréi decides to **KEEP** the email framework for future password-reset functionality, we will perform the following minimal fix to ensure the server doesn't crash when `nodemailer` attempts to boot its SMTP service.

## Exact Changes Required

Modify `server/modules/auth/email.ts` at line 28:

- _Before_: `return nodemailer.createTransporter({`
- _After_: `return nodemailer.createTransport({`

## Testing Strategy

1.  Run the TypeScript compiler via `npm run check`.
2.  If testing locally, we can place a temporary mock function call inside a route like `/api/test-email` that invokes `sendVerificationCode("test@test.com", "123")` and confirm that we no longer receive a `TypeError`.
3.  If SMTP keys are empty in `.env`, the script is built to gracefully fall back to `console.log` dev mode (which was correctly implemented on line 60). We will verify this dev mode print works.

## Risk / Tradeoffs

- There's no risk to this change—it simply corrects a fatal syntax typo.
