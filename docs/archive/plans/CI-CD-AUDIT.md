# CI/CD audit and repair plan

Status: partially implemented; CI repair verification in progress. The original
audit below is a historical baseline, not a claim that all follow-up work is done.

## CI failure repair — 2026-09-06

The `dd608fc` run failed in Go lint, Go security, integration tests, and browser
startup; Required Checks correctly failed as their aggregate. Full authenticated
runner logs were retrieved for this repair.

- Removed the obsolete `gosimple` entry (its checks are part of `staticcheck` in
  v2) and preserved v1's default documentation-comment exclusions. Runtime and
  security linters remain enabled. See the
  [official migration guide](https://golangci-lint.run/docs/product/migration-guide/).
- Fixed unchecked asynchronous email errors, SMTP TLS configuration and fallback
  recipient handling, context-aware network calls, and unused auth helpers.
  Restricted security suppressions to documented protocol/metadata false positives.
- Bounded Argon2 verification parameters and added malformed-hash regressions.
- Updated pgx to 5.9.2 and x/text to 0.39.0 for the reachable vulnerabilities
  GO-2026-5004 and GO-2026-5970 reported by govulncheck.
- Provisioned separate disposable PostgreSQL databases for each service in CI;
  the previous shared database caused concurrent migration-table creation failures.
- Set DynamoDB test configuration before module import, fixed cookie parsing and
  permission argument order in the WebSocket fixture, and made missing CI DynamoDB
  fail instead of silently skipping that suite.
- Replaced the weak smoke selection with a separate anonymous smoke test proving
  readiness, protected-route rejection, real Go auth routing, and rendered login UI.
  Authenticated dashboard/canvas browser coverage still needs real account fixtures;
  this repair does **not** claim the entire browser suite runs in CI.
- Excluded host dependencies, build output, environment files and keys from the
  Docker build context. Existing production/deployment gates are retained.
- The first complete hosted run passed all test/security gates but exposed a
  Docker install failure: `.npmrc` was missing before `npm ci`. Both Docker stages
  and EC2 upload manifests now include the existing project config, keeping the
  lockfile's peer-resolution settings consistent. An artifact-contract regression
  test protects this boundary.

Local verification: 324 Node tests passed with real DynamoDB enabled, 55.59% line
coverage, TypeScript and ESLint passed (existing warnings remain), production build
passed, actionlint passed, Go lint reported zero issues, Go tests passed, gosec
reported zero issues, and govulncheck reported zero reachable vulnerabilities.
Go verification used a clean auth snapshot so unrelated in-progress auth/UI edits
were not included. Hosted Linux race, browser and Docker results remain the final
acceptance gate; consult the CI run for the deployed commit, not this local tally.
Remaining artifact-promotion, rollback, release provenance, branch protection and
t3.small rollout work below must not be treated as completed by a green CI run.

## Original audit

Audit date: 2026-09-06. Source revision:
`a911ff30286b1bd4d2c1eaade0a797b185e84a33`.

Target: the existing single AWS t3.small deployment. Plan around one Node process,
one Go auth process, host NGINX, and local datastores after verifying the host's
actual configuration. Retain managed DynamoDB for production canvas persistence
if that is what the host currently uses; DynamoDB Local belongs in isolated tests.

## Assessment

The pipeline has useful lint, type, unit, security, and build jobs, but production
deployment does not depend on them. A push to main independently launches CI,
auth checks, deployment, release automation, and Scorecard. Consequently, a failed
E2E or Go security job cannot prevent an artifact upload to production.

The current release also has reproducibility and recovery gaps: incomplete upload
contents, independent frontend and auth updates, dependency installation against
the live directory, automatic schema push, and health checks that do not prove
application readiness. Fix the release gate and artifact contract before making
the failing upload succeed.

This audit changes documentation only. It did not run deployment scripts, access
EC2, alter GitHub settings, or retry failed workflows. Existing uncommitted auth
and environment edits were excluded from the proposed changes. Local passing
tests from the cleanup are not equivalent to a passing hosted deployment.

## Observed GitHub results

The public GitHub Actions API was queried for the source revision above, including
job results and check annotations. These are observed outcomes, not predicted
failures. Full runner logs and production state were not retrieved.

| Workflow                                                                                       | Observed result | Evidence and interpretation                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CI/CD Pipeline](https://github.com/Andiewitz/Meshwork-Studio/actions/runs/34024674612)        | Failed          | E2E failed; lint, typecheck, unit/integration, dependency-audit, secrets-scan, and coverage jobs reported success. Build and Docker verification were skipped. Successful audit/coverage status is weakened by the fail-open behavior below.       |
| [Production deployment](https://github.com/Andiewitz/Meshwork-Studio/actions/runs/34024674626) | Failed          | Failed at artifact transfer after its independent Node and Go builds. Exact SCP/SSH error is not in the returned annotations; do not attribute it to missing paths without the full log. The missing paths are separately confirmed in source.     |
| [Auth Service](https://github.com/Andiewitz/Meshwork-Studio/actions/runs/34024674645)          | Failed          | Race tests passed. Lint configuration verification rejected `run.linters`. govulncheck failed and annotated reachable standard-library call paths. Docker job was skipped. Exact advisory IDs and fixed versions require the full security report. |
| [Release](https://github.com/Andiewitz/Meshwork-Studio/actions/runs/34024674657)               | Failed          | Annotation reports GH013: semantic-release attempted to push HEAD to main, but repository rules require a pull request.                                                                                                                            |
| [Scorecard](https://github.com/Andiewitz/Meshwork-Studio/actions/runs/34024674636)             | Passed          | This does not establish that deployment or application tests passed.                                                                                                                                                                               |

Annotations also report deprecated Node 20 action runtimes being forced onto Node
24, and an unsupported `workdir` input for gosec. The runtime used to execute an
action is separate from the application's Node version set by setup-node.

Environment reviewer settings, all required checks, bypass actors, SSH host
verification, actual host paths, free disk/RAM, backups, and AWS billing remain
unverified. The release annotation does establish that a PR rule exists.

## Findings and fixes

### F01 — P0: production and staging bypass CI

Evidence: [production workflow](../.github/workflows/deploy-production.yml),
lines 3–6; [staging workflow](../.github/workflows/deploy-staging.yml), lines 3–6.
Each deploys on a branch push in an independent workflow. Neither waits for CI or
auth checks. Build in CI also excludes security and coverage jobs from its needs.

Fix: use one orchestrating workflow with explicit dependencies and reusable
validation/deployment workflows. A stable `required-checks` job must fail unless
every applicable prerequisite succeeds. On PRs, validate without deployment
credentials. On a trusted main push, validate that exact commit, package it, and
deploy only after the aggregate gate succeeds. Manual deployment must select an
already verified commit/artifact, not rebuild arbitrary unchecked branch code.
Configure the same aggregate status as a required repository check.

Acceptance: intentionally fail E2E, Go security, coverage, or package verification;
each prevents the deploy job from starting. A docs-only PR still produces a
deliberate aggregate result rather than leaving required checks pending.

### F02 — P0: artifact contract is incomplete

Evidence: production line 63 and staging line 51 upload a missing root `shared`
directory. Both later execute `scripts/deploy-remote.sh`, but neither uploads
`scripts`. The archive also omits workspace package manifests even though the
[root package](../package.json) declares npm workspaces. Root Drizzle config
points into `server/shared/schema.ts`, which that upload does not contain.

Fix: create one versioned release archive in CI with an explicit allowlist and
manifest. Include frontend assets, server bundle, Go binary, deployment entrypoint,
runtime dependency closure, and the required migration mechanism. Validate every
required path and reject unexpected secrets before upload. Extract and start the
archive on an otherwise clean Linux target; no old checkout may supply missing
files. Do not merely change `shared` to `server/shared` and assume packaging works.

Acceptance: both environments deploy the same archive format from an empty
release directory. Missing entrypoint, package, or binary fails before SSH.

### F03 — P0: remote installs and migration paths are not reproducible

Evidence: [deploy-remote.sh](../scripts/deploy-remote.sh), lines 48–52, runs
`npm install --omit=dev --legacy-peer-deps` followed by `drizzle-kit push`.
[package.json](../package.json) runs `husky` in prepare, while Husky is a dev
dependency. A clean production-only install therefore needs an explicit lifecycle
strategy. [drizzle.config.ts](../drizzle.config.ts) requires `DATABASE_URL`, while
the application uses domain-specific DSNs. Node and Go already apply versioned
migrations during startup; see [Node migration runner](../server/lib/migrate.ts)
and [Go migration runner](../server/services/auth/internal/store/migrate.go).

Fix: prepare locked production dependencies on a Linux runner matching the host's
OS/architecture, and include them in the archive. Account for workspace symlinks
and optional native modules; check the unpacked artifact. If installation must
remain on EC2 temporarily, use `npm ci --omit=dev` in a new release directory with
complete manifests and a tested conditional prepare script. `HUSKY=0` alone does
not make a missing Husky executable available. Do not blanket-disable dependency
install scripts without checking native dependencies.

Remove root schema push from deployment and image startup. Make migrations an
explicit, locked, versioned phase using the existing service migrations, adding a
migrate-only entrypoint where needed. Use forward-compatible schema changes, a
verified backup, and a tested recovery path. Enforce serialization at the migration
runner too, so an overlapping process restart cannot race schema changes.

Acceptance: package lock remains unchanged; an empty target installs/starts without
dev tools. Repeated migration runs are safe. A failed migration stops activation.

### F04 — P0: updates lack a complete rollback transaction

Evidence: workflows upload directly over the application directory with `rm: false`.
[local deploy script](../scripts/deploy.sh), lines 194–234, moves `dist` and the
auth binary separately and deletes/recreates PM2 processes. Despite its comments,
the two directory moves are not one atomic release switch. It transfers neither
updated dependencies nor a complete release. Staging cancellation can interrupt
a deployment; GitHub concurrency does not serialize a manually run SSH script.

Fix: use `releases/<sha>/`, `current`, and a separate shared environment file.
Upload to a unique temporary directory, verify, then mark the release complete.
Take a host-side deployment lock. Preflight disk, memory, config, and migrations;
stop/restart only the named application processes around an atomic current-link
replacement. Explicitly restart both processes from the selected release: changing
a symlink alone does not redirect an already running process. Keep NGINX paths
consistent and preserve assets needed by clients during the switch.

On failed readiness, restore the previous release and restart its processes.
Application rollback must respect migration compatibility: destructive database
changes need a separate recovery decision, not automatic reverse SQL. Keep the
previous successful release until the new one passes. Route manual deployments
through this same mechanism, and do not cancel a deployment once host mutation
has begun.

Acceptance: interrupt upload, fail migration, crash either service, and fail a
smoke check on a disposable target. The old release remains usable or is restored,
the job reports failure, and logs identify both attempted and restored SHAs.

### F05 — P0: health success does not prove release readiness

Evidence: [server/index.ts](../server/index.ts), lines 203–248 and 296–376,
exposes `/health` before module initialization finishes. It can keep serving
health after route initialization fails; `/ready` tracks initialization separately.
The remote script only warns on failed health, and the local deploy script prints
success even after `UNKNOWN` or `UNAVAILABLE`. Workflow probes use HTTP to the host
address, not the public HTTPS origin. Auth is restarted in a separate SSH session
without sourcing the environment file, so new/existing PM2 processes can receive
different environment values.

Fix: explicitly load the same environment for both processes. Require bounded
timeouts/retries for Node `/ready`, datastore health, auth `/healthz`, the public
HTTPS origin, and a safe session/auth-routing probe. Record the release SHA in a
minimal version endpoint or response field and require it to match the artifact.
Return nonzero on exhausted checks and invoke the rollback path. Verify auth
health semantics instead of assuming its liveness probe covers every dependency.

Acceptance: a server with broken route initialization or a stale release cannot
produce a successful deployment. Auth starts correctly on a fresh target.

### F06 — P1: E2E environment no longer matches the application

Evidence: [ci.yml](../.github/workflows/ci.yml), lines 112–153, provisions one
PostgreSQL database and exports legacy generic DSNs. [makeServiceDb](../server/lib/db.ts)
rejects missing per-service DSNs. CI does not start Go auth, Redis, or DynamoDB
Local. [Playwright config](../playwright.config.ts) sets `E2E_BYPASS_AUTH=true`,
but runtime code does not implement that flag and the
[security guard](../scripts/no-auth-bypass.sh) forbids it. Existing dashboard tests
assume the removed bypass. GitHub confirms E2E failure; full logs should establish
the first runtime error before implementation.

Fix: create isolated CI datastores, apply migrations, generate disposable signing
keys/secrets, start auth and Node, and wait for readiness. Seed users through a
test-only fixture and log in through the actual auth/session path. Keep production
bypass flags forbidden. Test a production bundle for release acceptance; test
doubles can serve a separate fast UI suite but cannot replace that acceptance test.

Acceptance: fresh Linux CI can log in, create and reload a workspace/canvas, and
verify a second user cannot access it. Fixtures clean up and use no production data.

### F07 — P1: production smoke tests target the wrong server and select no tests

Evidence: production lines 119–125 set `BASE_URL` and grep `@smoke`, but
Playwright hardcodes localhost and always starts the local dev server. Neither
checked-in E2E file defines `@smoke`. Failures are ignored with continue-on-error.

Fix: add a separate remote smoke config which requires a validated HTTPS base URL,
has no local webServer, and selects a small explicit smoke suite. Make zero selected
tests and smoke failures fatal. Keep production probes read-only; run mutating
full E2E against isolated CI/staging fixtures. Store failure traces with short
retention and avoid session secrets in logs.

Acceptance: discovery lists a nonzero smoke suite; every request targets the
configured origin, and a deliberate public routing failure fails deployment.

### F08 — P1: coverage and DynamoDB parity checks give false reassurance

Evidence: [Vitest config](../vitest.config.ts), line 20, produces text/json/html,
but CI expects `coverage-summary.json` and explicitly exits successfully when it
is absent. No built-in threshold is configured. The 80% threshold is therefore
not enforced through the configured reporting path.

The former DynamoDB parity suite skipped itself during collection before its
reachability check could run. It is now an explicit system test at
[`tests/system/canvas/dynamodb-parity.test.ts`](../tests/system/canvas/dynamodb-parity.test.ts)
and CI runs it against its DynamoDB Local service. Vitest's own DSNs point to
port 5434, whereas CI's PostgreSQL service uses 5432.
Many integration suites mock storage, so a passing run is not proof of real DB IO.

Fix: enforce coverage in Vitest, define intended source include patterns, generate
json-summary for reporting, and fail if output is missing. The measured baseline
on this revision is 46.87% lines, so use a temporary 46% non-regression threshold
while focused tests raise coverage toward the 80% target. Make the real datastore suite mandatory in
CI, with connectivity asserted inside setup before running tests, not a skip
condition based on a later hook. Correct DSNs and separate mocked route tests from
real integration jobs.

Acceptance: deliberately reduced coverage fails; deleting the report cannot turn
failure into success; parity tests execute against DynamoDB Local and fail when
that dependency is intentionally absent in CI.

### F09 — P1: Go workflow configuration and security need repair

Evidence: [auth.yml](../.github/workflows/auth.yml), lines 8/12, filters changes
to a nonexistent `identity.yml`, so editing auth.yml alone does not trigger it.
[.golangci.yml](../server/services/auth/.golangci.yml) nests linters under run;
the hosted annotation explicitly rejects this schema. gosec receives an unsupported
`workdir` input; defaults.run.working-directory does not configure an action step.
govulncheck uses `@latest`, has failed findings, and is not a Docker prerequisite.

Fix: use the correct path filter or call auth validation from the orchestrator.
Choose a supported Go/toolchain and linter combination, pin tools, migrate the
linter configuration to that version's schema, and run config verification first.
Run gosec explicitly from the auth module using a supported invocation. Retrieve
govulncheck's full report, identify affected toolchain/modules and fixed versions,
upgrade, and rerun race tests and vulnerability checks. Do not suppress security
to make the pipeline green. Include all Go gates in aggregate acceptance.

Acceptance: changing workflow/config/go.mod triggers checks; config validation,
race tests, gosec, and govulncheck pass with pinned tools on a clean runner.

### F10 — P1: Docker checks cannot validate a fresh checkout

Evidence: [Dockerfile](../Dockerfile) copies host node_modules/dist and missing
shared, while the Docker CI job only checks out source and never downloads build
output or installs dependencies. It uses Node 20 while workflows select Node 22.
[Auth Dockerfile](../server/services/auth/Dockerfile), line 16, appends shell
syntax to a JSON-looking healthcheck on a distroless image without a shell.

Fix: use a multi-stage reproducible root build, align the tested Node version, and
remove schema mutation from CMD. Set auth healthcheck to pure exec form
`CMD ["/app/identity", "-healthcheck"]`; its executable already returns failure.
Restore node_modules/dist exclusions in the root Docker context once it no longer
depends on host builds, and exclude private/generated files from the auth context.
Build and start both images in CI; a successful image build alone is insufficient.
Container verification does not require moving production away from PM2.

Acceptance: images build from a clean checkout with no host outputs, start under
their intended users, become healthy, and fail health when their dependencies fail
according to the documented probe contract.

### F11 — P1: release automation conflicts with main's PR rule

Evidence: [.releaserc.cjs](../.releaserc.cjs) uses changelog/git plugins, and the
hosted Release annotation reports the attempted main push was rejected by GH013.
[release.yml](../.github/workflows/release.yml) independently builds on each push,
has broad write permissions, and does not depend on validation or deployment.

Fix: prefer GitHub release notes and tags tied to the verified deployed SHA, with
no generated commit back to main. Remove plugins that require such a commit. If
a checked-in changelog is required, update it through a release PR. Run release
publication after successful activation/smoke, with narrow permissions and
serialization. Retrying publication should not redeploy the application. A release
publication error should report failed metadata publication, not roll back a
healthy application. Do not weaken the repository's PR rule to fix this job.

Acceptance: a qualifying release succeeds under existing PR rules, points to the
verified SHA, and can be retried without modifying main or redeploying.

### F12 — P1: deployment topology and staging have drifted

Evidence: [NGINX config](../deploy/nginx.conf) serves an ec2-user/app path; workflows
use a username-dependent meshwork-studiov2 path. The remote script starts Node
with its parent directory as cwd. [start-ec2.sh](../scripts/start-ec2.sh) names two
historical PostgreSQL containers; [Compose](../docker-compose.yml) defines one.
[Bootstrap script](../deploy/ec2-user-data.sh) targets Amazon Linux, host Redis,
and an RDS client, while other instructions use Ubuntu and Docker datastores.
Staging does not build/deploy auth, so it cannot validate the production pair.

Fix: inventory the live host read-only during implementation, then select and
document one host OS, directory layout, PM2 definition, datastore topology,
production origin, and process environment contract. Render and test NGINX config
before activation and preserve verified TLS settings. Do not blindly replace
host config with the checked-in HTTP example. Have staging consume the identical
archive and deployment script. If staging shares the t3.small, validate capacity
and isolate all databases, ports, sessions, and table names; prefer ephemeral CI
acceptance to a second permanent full stack on a constrained host.

Acceptance: bootstrap, deploy, reboot, and rollback work on a disposable host
without hand-editing paths. NGINX serves the expected release and auth routes.

### F13 — P1/P2: security and maintenance controls need tightening

Evidence: npm audit uses continue-on-error. Actions reference mutable tags/branches
(including TruffleHog main and gosec master); some tools are installed at latest.
Most workflows do not explicitly scope token permissions. SSH steps provide no
expected host fingerprint. Runtime-deprecation annotations already exist.
[Dependabot](../.github/dependabot.yml) does not cover Go or the nested auth
Dockerfile. [CODEOWNERS](../.github/CODEOWNERS) still names server/modules/auth
and root shared paths; its default owner still applies, but specialist paths drifted.

Fix: block applicable high/critical production dependency findings; report dev
findings under a separate explicit policy. Pin reviewed action commits and tool
versions, update deprecated action runtimes, and set read-only defaults with job
write permissions only where necessary. Configure SSH host-key verification from
an independently verified fingerprint and limit deployment account privileges.
Keep secrets scoped to trusted deploy jobs/environments. Confirm branch and
environment protections using repository settings rather than inferring them from
YAML. Add Go/nested-image updates and correct ownership paths. Run actionlint and
shellcheck in CI; passing a YAML parser does not validate action input contracts.

Acceptance: no unsupported inputs or runtime-deprecation warnings; PR jobs have
no deployment secrets; audit policy fails as intended; changed host identity
blocks SSH; scanners and ownership rules cover current paths.

## Proposed pipeline

```text
PR / trusted branch push
  -> Node lint/types/unit + coverage + dependency/secrets checks
  -> Go lint/race/security
  -> one Linux build and complete release archive for that commit
  -> real integration/E2E + clean archive boot + image verification
  -> required-checks aggregate
       PR: finish validation
       trusted main: production environment gate
         -> host lock + preflight + migration + activate exact archive
         -> readiness + HTTPS smoke + SHA match
              success: retain release, publish release metadata
              failure: compatible application rollback, mark failed
```

Build may run in parallel with independent validation, but deployment requires
all of it. A release archive may exist before it is eligible for promotion.
Build once per candidate SHA; staging/main commits can differ and each needs its
own validation. Staging for a given candidate should consume that same archive.
Use runtime configuration or same-origin frontend URLs to avoid rebuilding the
client during promotion. If Vite compile-time values must differ, record that as
a distinct artifact variant and test each variant; do not call it identical.

Prefer reusable workflow calls with explicit needs. A workflow_run design is an
alternative only with careful verification of source repository, event, branch,
commit, success conclusion, and artifact run ID; never consume an arbitrary PR's
artifact in a privileged deployment.

Suggested archive contract (to be proven by a clean extraction test):

```text
release-manifest.json  # SHA, tool versions, platform, checksums, migration IDs
dist/                 # Node bundle and frontend assets
meshwork-auth         # matching Linux auth binary, embeds its SQL migrations
runtime/              # locked dependency closure and needed workspace manifests
scripts/              # deployment and migration entrypoints
deploy/               # reviewed PM2 and NGINX templates
```

No .env, SSH keys, repository metadata, or developer binaries belong in the
archive. Define NODE_PATH/module resolution or place production node_modules at
the actual bundle resolution root; `runtime/` is a proposed contract, not an
assumption that Node automatically resolves it. Keep environment files outside
release directories with restricted access. Store checksums, but also bind the
archive to the trusted workflow run; a checksum by itself is not provenance.

## Implementation sequence

| Slice                                | Work and primary files                                                         | Completion evidence                                                                      | Rough effort |
| ------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------ |
| 1. Block unsafe promotion            | F01; orchestrator, deploy workflows, aggregate status, repository checks       | Intentionally failing prerequisite cannot start deployment                               | 0.5–1 day    |
| 2. Restore trustworthy tests         | F06–F09; CI, auth workflow, Vitest, Playwright, fixtures, linter/tool versions | Green hosted checks, real parity execution, nonzero smoke discovery, meaningful coverage | 1–3 days     |
| 3. Define and validate packaging     | F02/F03/F10; build/package scripts, manifests, Dockerfiles                     | Clean Linux archive boot and image health, no stale checkout dependency                  | 1–2 days     |
| 4. Repair host deployment/recovery   | F03–F05/F12; one deploy entrypoint, PM2/NGINX config, migration runner         | Fresh-host deploy, failure injection, rollback, and reboot demonstration                 | 1–3 days     |
| 5. Fix release and harden            | F11/F13; release config, permissions, action pins, Dependabot, ownership       | Release works within PR rule; checks reject bad permissions/inputs/host key              | 0.5–1.5 days |
| 6. Reduce waste and document handoff | Metrics, path classification, artifact retention, runbooks                     | Measured before/after duration and storage, one current runbook                          | 0.5–1 day    |

Effort assumes one developer and usable environment access, excludes time to
repair unknown application/security findings, and is not a delivery guarantee.
Implement through focused PRs. Do not enable the newly repaired upload until
gates, packaged startup, migrations, and rollback have been demonstrated together.

## t3.small and pipeline cost controls

- Keep compilers, browser installation, scans, and dependency resolution on
  hosted runners. Deploy a prepared archive to reduce EC2 CPU-credit use and RAM
  pressure. Avoid permanent self-hosted CI on the production instance.
- Current main pushes can perform six npm ci installs in CI, one in deploy, and
  one in release: eight across these workflows when all relevant jobs run. There
  are up to three independent Node builds. The observed failing CI skipped its
  build, so these are configured opportunities, not measured completed work.
  Eliminate deploy/release rebuilds first. Consider grouping cheap lint/type/unit
  tasks to share one install after measuring elapsed time and runner minutes.
- Continue lockfile-keyed npm caching; it saves downloads, not the installation
  itself. Measure Playwright install/cache performance before keeping both layers.
  Pin browser tooling to the dependency lockfile. Add Go cache keys for go.sum.
- Run heavy jobs only for relevant source, dependency, shared-contract, or pipeline
  changes. Docs-only checks should still complete the stable required aggregate.
  Workflow, migration, auth, and shared-contract changes must trigger all affected
  validations. Do this only after correctness gates work.
- Retain deployable artifacts long enough for the agreed rollback window; the
  current three-day build artifact retention is not a deliberate release policy.
  Suggested starting point: 14 days in Actions and the last 2–3 successful releases
  on EC2, constrained by measured free disk. Never prune current/previous or prune
  before verifying the new release. Keep failed-test traces short-lived.
- Use short graceful restarts with an explicit outage budget initially. Running
  two full stacks during a blue/green switch can exhaust a 2 GiB host; only adopt
  overlapping processes after a load/memory test proves headroom.
- Record runner minutes, archive size, deploy duration, peak host memory,
  CPU-credit changes, and rollback time for the next five deployments. No dollar
  savings are asserted: actual GitHub plan, allowances, repo billing, and AWS
  telemetry were not inspected.

## Final acceptance checklist

- [ ] Required checks fail closed and production consumes the same verified SHA.
- [ ] Go security findings are resolved with a retained report identifying fixes.
- [ ] Clean Linux acceptance covers login, authorization, persistence, and reload.
- [ ] Coverage reports exist and parity tests execute rather than skip.
- [ ] Archive contains everything required and no secrets; startup is tested.
- [ ] Migrations are versioned, serialized, backed up, and compatibility-reviewed.
- [ ] Fresh-host deployment, restart after reboot, and rollback are demonstrated.
- [ ] Public HTTPS, Node readiness, auth, and release SHA checks are mandatory.
- [ ] Release automation succeeds without pushing generated commits to main.
- [ ] One runbook explains deployment, failure diagnosis, rollback, and recovery.
- [ ] CI duration/storage and EC2 deploy overhead are measured before tuning.

## Audit validation and references

Read all six workflows, the composite setup action, release configuration,
Dependabot/CODEOWNERS, deployment/start/bootstrap scripts, both Dockerfiles,
Compose/NGINX, package/build configuration, test configuration, relevant tests,
health/readiness handlers, and migration runners. All six workflow files parse as
YAML. This is syntax validation only; known action/config errors remain above.
`npx playwright test --list --grep '@smoke'` exited 1 and reported zero tests,
confirming the smoke selection defect without starting a server. Both new plan
files' local Markdown links resolve. No application tests or deployments were
rerun for this documentation change.

Technical references supporting the proposed mechanics:

- [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax): job dependencies, permissions, environments, and concurrency.
- [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use): action pinning and privileged workflow risks.
- [npm ci](https://docs.npmjs.com/cli/commands/npm-ci/) and [lifecycle scripts](https://docs.npmjs.com/cli/using-npm/scripts/): locked installs and prepare behavior.
- [Playwright web servers](https://playwright.dev/docs/test-webserver): baseURL and local-server configuration.
- [Vitest coverage](https://vitest.dev/config/coverage): reporters, included sources, and thresholds.
- [Dockerfile health checks](https://docs.docker.com/reference/dockerfile/#healthcheck): command forms and exit status.

Read [the broader root plan](../PLAN.md) for application optimization priorities
beyond the delivery pipeline. This focused plan supersedes its brief CI/CD advice
where this audit provides more specific evidence.
