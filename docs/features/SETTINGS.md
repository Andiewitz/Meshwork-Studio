# Settings and Account Capabilities

This page documents the current server contract, not every control visible in
the settings UI. A rendered control is not evidence that its endpoint exists.

## Available identity operations

The Go identity service owns account state. Its OpenAPI contract is
[`server/services/auth/api/openapi.yaml`](../../server/services/auth/api/openapi.yaml).
The public service is mounted below `/api/v1` by NGINX.

| Operation          | Current contract                           | Notes                                                           |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------- |
| Current identity   | `GET /api/v1/auth/me`                      | Returns the authenticated user and account flags.               |
| Change password    | `POST /api/v1/auth/change-password` + CSRF | Email/password accounts only; current password is required.     |
| User preferences   | `PATCH /api/v1/user/preferences` + CSRF    | Owned by the Go auth service.                                   |
| Session management | `GET`/`DELETE /api/v1/auth/sessions`       | Use the auth OpenAPI contract for request and response details. |
| MFA                | `/api/v1/auth/mfa/*` + CSRF                | Enrollment, activation, and disable flow are owned by Go auth.  |

All mutation requests require an authenticated session and valid CSRF token.
Use the application's `secureFetch` client rather than manually managing the
token.

## Pending or unsupported operations

The following are **not** part of a verified server-side contract today:

| UI or historical claim                                 | Current status                                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Profile mutation at `PATCH /api/v1/user/profile`       | The UI contains this call, but the matching identity handler/OpenAPI operation is absent. Do not integrate against it. |
| Password change at `POST /api/v1/user/change-password` | The verified route is `/api/v1/auth/change-password`; the UI path must be reconciled with the auth contract.           |
| Export account data                                    | Placeholder only.                                                                                                      |
| Delete all data while retaining account                | No verified endpoint or cross-service transaction exists.                                                              |
| Delete account at `DELETE /api/v1/user/account`        | The UI contains this call, but no matching server handler/OpenAPI operation exists.                                    |

These gaps are product and implementation work, not documentation shortcuts.
Before exposing any of them as available, define ownership across auth,
workspace, team, AI, metrics, and DynamoDB; add an authenticated server flow;
specify recovery boundaries; and test the full cleanup path.

## Security rules

1. Never put password, MFA, or account deletion logic in the browser alone.
2. Account operations must be authorized by the auth service, not a client-side
   provider flag.
3. Destructive operations need a server-side confirmation protocol, audit log,
   idempotency strategy, and a documented recovery boundary.
4. Do not claim an irreversible deletion completed until every owning service
   has acknowledged its cleanup work.

## Verification checklist

When adding or changing a settings capability:

- Update the Go OpenAPI contract and the UI request path together.
- Add Go handler and Node integration coverage as appropriate.
- Verify CSRF, session, password/MFA, and OAuth-account failure modes.
- Document whether data is deleted synchronously, queued through an outbox, or
  intentionally retained for recovery/legal reasons.
- Update [`SECURITY.md`](../SECURITY.md) and
  [`RECOVERY.md`](../operations/RECOVERY.md) when the security or recovery
  boundary changes.
