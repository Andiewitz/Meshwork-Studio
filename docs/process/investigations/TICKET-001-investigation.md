# Investigation: TICKET-001 (Email Verification Schema Mismatch)

## Findings

During an exhaustive search of the codebase, I investigated the status of the `emailVerification` modules.

1. **Backend Route Usage**:
   The functions `createVerification` and `verifyCode` defined in `server/modules/auth/verification.ts` are **never** imported or executed anywhere in the backend (checked `routes.ts`, `authCore.ts`, etc.).
2. **Frontend Usage**:
   While a `VerifyEmail.tsx` file exists in the UI directory, when checking `client/src/App.tsx`, there is absolutely no route connected to `/auth/verify` or anything related to email verification.
3. **Schema Status**:
   The `users` table does technically have `emailVerificationCode` fields, but since no backend routes populate them or verify against them, they are effectively dead weight.
4. **Conclusion**:
   The Email Verification feature was started (UI and one helper file created) but subsequently completely abandoned before it was ever wired into the router (`App.tsx`) or backend controllers (`routes.ts`).

## Root Cause Analysis

This is classic "abandoned feature branch" syndrome. The code was written but never fully integrated into the user flow. Because of this, it started drifting out of sync with the overall architecture (causing the schema mismatches initially reported).

## Affected Files

- `server/modules/auth/verification.ts` (Entire file is dead code)
- `server/modules/auth/email.ts` (Line 40: `sendVerificationEmail` is dead code)
- `client/src/pages/auth/VerifyEmail.tsx` (Unreachable dead code)
- `shared/schema.ts` (Unused columns in the `users` table: `emailVerificationCode`, `emailVerificationExpires`, `isEmailVerified`)
