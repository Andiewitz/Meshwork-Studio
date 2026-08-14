# Implementation Plan: TICKET-001 (Email Verification Removal)

## Decision

**REMOVE** the Email Verification feature entirely.
Because the UI and routes are completely disconnected from the actual Auth flow, leaving this hanging code invites confusing schema errors and maintenance overhead for a feature that isn't actually being used.

## Exact Changes Required

### 1. Delete Dead Files

Execute the deletion of completely dead files that are isolated from the main flow:

- `rm server/modules/auth/verification.ts`
- `rm client/src/pages/auth/VerifyEmail.tsx`

### 2. Clean Up Email Module

Modify `server/modules/auth/email.ts` to remove the dead export `sendVerificationEmail` and its associated types.

### 3. Clean up Database Schema

Modify `shared/schema.ts` to:

- Remove the recently added `verificationAttempts` table.
- Remove `emailVerificationCode` and `emailVerificationExpires` from the `users` table.
- Remove `isEmailVerified` (unless we want to default it to `true` for future use, but it's simpler to remove it since there is no route setting it to false on creation).

### 4. Update the DB

- Run the drizzle schema generation to reflect the removed columns.

## Testing Strategy

1.  Run the full Vitest auth regression test suite (`npm run test:auth`) after removal.
2.  Start the dev server and test creating a new user manually using `/auth/register` to ensure the absence of those fields doesn't crash the Drizzle schema insertions.
3.  Run TypeScript compiler (`npm run check`) to ensure no hidden references exist.

## Risk / Tradeoffs

- **Trade-off**: The user will not have an email verification step when signing up.
- **Rebuttal**: They aren't getting one right now anyways because the code is entirely orphaned. If it becomes a strict requirement later, it's better to rebuild it properly integrated into the router than trying to piece together this abandoned branch.
