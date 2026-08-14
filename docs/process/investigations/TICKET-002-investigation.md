# Investigation: TICKET-002 (Passport User Type Extension)

## Findings

During an exhaustive Type System audit focusing on the `req.user` casting issues, I discovered the following:

1. **Occurrences of Bypass (`as any`)**:
   - `server/modules/workspace/routes.ts`: `(req.user as any)?.id` appears 11 times.
   - `server/modules/canvas/routes.ts`: `(req.user as any)?.id` appears 3 times.
   - `server/modules/ai/routes.ts`: `(req.user as any).id` was temporarily inserted by me during a previous check to quickly satisfy tests but must be replaced by a fundamental type definition.

2. **Root Cause Analysis**:
   When using Express with Passport.js, the `req.user` property is populated by Passport. However, the default TypeScript definition (`@types/express` and `@types/passport`) types `req.user` as a generic `Express.User` interface, which is intentionally blank so developers can override it. Since the project never explicitly augmented this base interface to match the `DbUser` structure from `@shared/schema`, TypeScript throws an error whenever `req.user.id` is accessed, forcing engineers to use `as any` to bypass the compiler strictness.

3. **Current Type Infrastructure**:
   - There is NO global `.d.ts` declaration file in the `server` directory.
   - The `tsconfig.json` for the server explicitly includes `server/**/*`, meaning any ambient declaration file we place there will automatically attach to the global Express namespace.

## Questions Answered

1. **How many files are affected?** 3 primary route files (`workspace`, `canvas`, `ai`).
2. **What properties are accessed?** Currently just `id`, but future additions will likely need `email`, `stripeCustomerId`, etc.
3. **Is there existing infrastructure?** No, the `types` directory is missing.

## Resolution Path

We must declare a Global TypeScript Augmentation for the Express namespace, linking `Express.User` to your database schema types.
