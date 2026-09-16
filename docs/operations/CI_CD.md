# CI/CD and Release Operations

This page describes the repository automation as configured in `.github/workflows`.
It is operational guidance, not a substitute for GitHub environment protection
rules or the workflow files themselves.

## Delivery flow

```text
Pull request or push to main/develop
  -> CI/CD Pipeline
      -> successful main run: Deploy to Production (AWS EC2)
      -> successful develop run: Deploy to Staging (AWS EC2)
          -> successful production deploy: Semantic Release
```

Deployments run only for successful CI runs from this repository. Pull requests
are verified but are not deployed. The production deploy checks out the exact
commit SHA that CI tested.

## CI/CD Pipeline

The `CI/CD Pipeline` workflow runs on pushes and pull requests targeting `main`
or `develop`. Its required checks are:

| Check                                           | Purpose                                                              |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| Lint and Type Check                             | Static correctness for the Node codebase.                            |
| Dependency Audit and Secrets Scan               | High-severity dependency and verified-secret detection.              |
| Auth Service Checks                             | Go lint, race tests, security scan, and container build.             |
| Unit & Integration Tests                        | Fast deterministic Node test suite.                                  |
| Browser Smoke Test                              | Real Node + Go + PostgreSQL + Redis + DynamoDB Local journey.        |
| Coverage Check                                  | Enforces the configured coverage threshold.                          |
| Build Application and Docker Build Verification | Ensures deployable application and container artifacts can be built. |

The browser job creates disposable assertion and internal keys for that run. It
does not require production credentials. Do not replace that setup with an auth
bypass or a long-lived repository secret.

## Deployment environments

| Branch    | GitHub environment | Workflow                | Target              |
| --------- | ------------------ | ----------------------- | ------------------- |
| `main`    | `production`       | `deploy-production.yml` | Production EC2 host |
| `develop` | `staging`          | `deploy-staging.yml`    | Staging EC2 host    |

Deployment environments must hold the SSH material and host configuration.
Production uses `EC2_HOST`, `EC2_USER`, and `EC2_SSH_KEY`; staging uses the
equivalent `EC2_STAGING_*` names. `VITE_API_URL` is supplied at build time.
See [`SECRETS.md`](./SECRETS.md) for rotation guidance.

## Failure triage

| Failed check                 | First action                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Lint / Type Check            | Run the named command locally; do not suppress the error.                                                                  |
| Auth checks                  | Run the corresponding Go command under `server/services/auth`; inspect the exact package failure.                          |
| Browser Smoke Test           | Read the Playwright trace and job annotation. Confirm the actual response status before changing auth, CSRF, or selectors. |
| Coverage                     | Add focused tests for the changed branch rather than weakening the threshold.                                              |
| Build or Docker verification | Reproduce with `npm run build` or `docker compose build`; check generated artifacts and environment assumptions.           |
| Deployment                   | Stop promotion, use the deployment rollback procedure, and preserve the failing job log.                                   |

Rerun only after checking whether the failure is deterministic. A retry can be
appropriate for runner/network faults, but it must not be used to hide a
repeatable test, authorization, migration, or build failure.

## Release and rollback

Semantic Release runs only after a successful production deployment. Conventional
Commit messages determine release notes and versioning. A production rollback is
an operational action: deploy a known-good commit/artifact using the procedure
in [`DEPLOYMENT.md`](./DEPLOYMENT.md), verify `/ready` and the authenticated
smoke path, then record the incident and follow-up work.

## Change checklist

When changing CI or deployment automation:

1. Update this guide and any affected secrets inventory.
2. Keep production credentials out of test jobs and logs.
3. Test the changed workflow path in a branch or staging environment.
4. Confirm that deployment still consumes the tested SHA, not the branch head.
