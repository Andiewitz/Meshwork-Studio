# Open-source readiness audit

Audited: 2026-09-16. Baseline: `4c5fb43572ce15902c9f2e4f567b4fb974c5e7b0`
(`chore: prepare repository for open source release v1.12.0`).

## Verdict

**Public source with a useful foundation, but not ready to advertise as a
reproducible, production-ready open-source release.** The repository is already
public. MIT licensing, contribution policies, issue templates, private security
reporting, dependency updates, and substantial automated tests are present.
However, the current build fails, the infrastructure-test command finds no tests,
the documented setup is inconsistent with the runtime, and historical credentials
need a rotation review. Adding community documents did not close those gaps.

This is an audit and implementation backlog, not an implementation or security
certification. No runtime source, credentials, GitHub settings, or Git history
were changed. Secret values are deliberately omitted. The build command cleared
the ignored `dist/` output before failing; regenerate it after fixing the build.

## Evidence and limits

| Check                    | Result on this audit                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Git baseline             | Clean `main`, matching cached `origin/main`; 422 tracked files; non-shallow history                                                                                                                                                              |
| TypeScript               | `npm run check` passed                                                                                                                                                                                                                           |
| Fast tests               | 40 files, 349 tests passed                                                                                                                                                                                                                       |
| Production dependencies  | `npm audit --omit=dev --audit-level=high --json`: zero reported vulnerabilities at audit time                                                                                                                                                    |
| Production build         | **Failed:** Vite HTML transform, `EISDIR`, `client/index.html`                                                                                                                                                                                   |
| Build cause isolation    | Client build with `write:false` succeeded when an in-memory transform removed only the canonical `href="/"` link; repository source unchanged                                                                                                    |
| Infrastructure tests     | **Failed discovery:** `npm run test:system` reports no test files and exits 1, before connecting to infrastructure                                                                                                                               |
| ESLint                   | Exit 0 with 2,570 warnings; count includes ignored-by-Git `.kilo/worktrees/` copies, so it is not a tracked-source defect count                                                                                                                  |
| Documentation links      | A simple relative-link check of 32 non-archive Markdown files found two missing targets in the PR template; anchors and all external links were not exhaustively validated                                                                       |
| Sensitive files          | Current tracked files do not include `.env`, SSH keys, PEM/key files; a historical `.env` remains reachable from current main                                                                                                                    |
| Secret pattern checks    | Narrow current-source and history searches found no matches for the selected AWS access-key, GitHub token, OpenAI project-key, and private-key-header patterns; this is not a comprehensive secret scan                                          |
| Package license metadata | 55 lockfile package entries lack recorded license metadata; no GPL/AGPL/SSPL/BUSL/UNLICENSED strings found in populated fields; not a license clearance                                                                                          |
| Public GitHub settings   | Public, main protected, private vulnerability reporting enabled, Discussions disabled                                                                                                                                                            |
| Public release           | Latest release returned by API was `v1.11.0`, while package and policy claim `1.12.0` / `1.12.x`                                                                                                                                                 |
| GitHub CI snapshot       | Completed **failure** for this SHA: Go lint and system-test step failed; required checks failed; application/Docker builds skipped. Anonymous browser smoke, Go race tests/security scan, TypeScript, lint and dependency/secret scans succeeded |

Docker, Go tooling, authenticated browser journeys, a clean container installation,
live AWS/IAM/backups, private repository rules, and credential rotation history
were not verified here. No historical credentials were used to contact services.
The observed [CI run](https://github.com/Andiewitz/Meshwork-Studio/actions/runs/35079230041)
confirms these job outcomes; a successful secret scan does not establish rotation
of the historical database/session credentials. The default passing suite does not establish that a real browser can log in,
resize nested nodes, save, and reload against persistent services.

## Findings

### OSS-01 — P0: historical credentials require incident review

**Evidence:** `.env` existed at `cd397f7` and was later removed at `e72acba`.
The original commit remains an ancestor of current HEAD. A redacted structural
inspection confirmed a database URL containing username/password and a nonempty
`SESSION_SECRET`. No evidence of their current validity or prior rotation was
available. These are historical credentials, not a confirmed active compromise.

**Impact:** ignoring/deleting a file in the latest tree does not remove earlier
versions. The public repository already exposes this history. The CI secret scan
uses `--only-verified`; that is insufficient evidence that arbitrary database
passwords or application signing secrets have been remediated.

**Action:** privately identify affected services; confirm retirement or rotate
still-relevant credentials and invalidate affected sessions. Record evidence
without retaining secret values. Review all reachable history, tags, branches,
release assets and archives with a dedicated scanner and manual triage. Coordinate
any history cleanup separately; do not force-push rewritten history casually.

**Acceptance:** every historical credential has documented rotation/retirement
evidence; remaining history findings are triaged; no sensitive values appear in
public reports. GitHub recommends revocation/rotation first in its
[sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

### OSS-02 — P1: the release-preparation change breaks production builds

**Evidence:** `client/index.html:9` now contains `<link rel="canonical" href="/" />`.
`npm run build` fails with `EISDIR` in `vite:build-html`. Removing that link only
in memory makes the client build succeed. The link changed from an absolute URL
in `4c5fb43`.

**Impact:** a contributor cannot build the current release candidate; Docker
builds also invoke this build. Prior successful builds of `59b498f` do not validate
this revision.

**Action:** omit the canonical tag for generic distributions or generate a valid
deployment-specific absolute URL. Make social sharing metadata configurable too.

**Acceptance:** unmodified clean checkout passes `npm ci`, production build and
Docker build; built HTML contains no directory-valued asset references.

### OSS-03 — P1: system tests never run through their advertised command

**Evidence:** `package.json:48` runs `vitest run tests/system`, while
`vitest.config.ts:27` includes only `tests/{unit,integration}/**/*.test.ts`.
The positional filter narrows that set; it does not add the excluded tests.
Both `tests/system/canvas/dynamodb-parity.test.ts` and `websocket.test.ts` exist.
The command returns `No test files found`. CI invokes this same command.

**Action:** introduce an explicit system-test configuration/project with matching
aliases and environment, and point the script at it. Retain the fast suite's
independence from infrastructure.

**Acceptance:** discovery finds both system files; five existing cases execute
against DynamoDB Local in CI; stopping the required service fails the run visibly.

### OSS-04 — P1: fresh contributor setup cannot satisfy the supplied stack

**Evidence:** `scripts/setup-dev.ts:83–176` places auth signing/encryption/HMAC
keys in `server/services/auth/.env`, but `docker-compose.yml:121–123` requires
those variables during Compose interpolation. Compose has no `env_file` wiring
for that service and the root generated `.env` omits them. `.env.example` also
omits required Compose keys, including `INTERNAL_API_KEY` and auth private keys.
Compose interpolation covers the project configuration even when selecting only
database services; do not assume the documented database-only command avoids it.

`CONTRIBUTING.md` starts only databases and the Node process and describes starting
auth as optional for auth development. Auth is required for ordinary login.
The root template lacks `ENCRYPTION_KEY`, as do the setup generator and backend
Compose environment. `server/services/ai/encryption/encryption.ts:9–19` requires
it for BYOK encryption. Adding a provider API key alone will not configure BYOK.

**Action:** choose one supported local flow, ideally a dev Compose profile with
all infrastructure and auth; align generated files, Compose interpolation, runtime
environment and examples. Generate a separate BYOK encryption key. Give explicit
native Windows instructions where Make/shell commands are otherwise required.

**Acceptance:** a clean clone with no AWS credentials or paid API keys can install,
start, register, verify a local test email, log in, create a workspace and save a
canvas using only documented steps. BYOK setup has a working optional path.

### OSS-05 — P1: setup recovery can create mismatched keys or report false success

**Evidence:** `scripts/setup-dev.ts:46–66` generates fresh shared values whenever
either env file is missing, then writes only missing files. If root `.env` exists
but auth `.env` does not, the new auth keys/internal secret need not match root.
When both exist, the script launches an unawaited diagnostic import and immediately
calls `process.exit(0)`. `scripts/diagnose-config.ts` also counts missing optional
Google OAuth as a failure and does not verify BYOK configuration completeness.

**Action:** preserve/derive existing pairings or stop with an actionable mismatch
message; make partial recovery transactional. Await diagnostics and propagate
their status. Separate required failures from optional-feature warnings.

**Acceptance:** cover neither file, both files, each individual missing file,
invalid keys, and optional features disabled. No existing secret is silently
rotated, and invalid required configuration cannot produce a success exit code.

### OSS-06 — P1: Compose is neither a complete dev experience nor a safe default deployment

**Evidence:** the frontend mounts host `./dist/public` while Dockerfile builds
assets inside its image; a fresh clone has no host build output. Auth is forced
to `NODE_ENV=production`, and `config.go` requires SMTP host and sender in that
mode, although Compose defaults both to empty. NGINX advertises HTTP on port 80
while the configured public app URL defaults to port 5000. Database/cache ports
bind all host interfaces, including Redis without a configured password.

**Impact:** fixing only the missing variables will still leave first-run failures,
origin/configuration inconsistencies, and unnecessary network exposure if copied
onto an internet-facing host. Secure-cookie behavior requires a deliberate
HTTPS/dev-mode choice; localhost behavior is not proof of production suitability.

**Action:** ship frontend assets in an image, provide a coherent dev profile with
a local mail sink and one public origin, bind local database ports to loopback,
and separate production configuration with TLS and persistent-volume guidance.

**Acceptance:** clean Docker startup needs no host `dist/`, SMTP account or AWS
account; reboot preserves data; production docs expose only intended public ports.

### OSS-07 — P1: the verifier's “public key” is actually private signing material

**Evidence:** `server/auth/assertion.ts:28–45` accepts an Ed25519 seed and calls
`crypto.createPrivateKey` before deriving the public key. Setup copies the same
seed into `AUTH_ASSERTION_PUBLIC_KEY` and `AUTH_ASSERTION_PRIVATE_KEY`.
Diagnosis explicitly checks equality. This contradicts the public-key-only
boundary described by Compose and the architecture documentation.

**Impact:** whoever obtains the monolith's verifier configuration also obtains
assertion-signing capability. This broadens credential exposure across services;
this audit did not demonstrate an end-to-end authentication bypass through other
middleware/session checks.

**Action:** configure the monolith with an actual raw/SPKI public key, keep seeds
only in auth, and update generation, diagnosis and rotation together.

**Acceptance:** Go-signed assertions verify in Node using only public material;
wrong key, expired token and key-rotation tests pass; monolith configuration no
longer contains enough material to sign an assertion.

### OSS-08 — P1: browser checks do not prove the main product works

**Evidence:** `tests/e2e/canvas.spec.ts` largely checks body visibility and includes
an obsolete auth-bypass comment. Dashboard tests navigate to protected pages and
create workspaces without a login fixture. The CI browser job selects `@smoke`,
which verifies anonymous routing/login rendering, not authenticated editing.

**Action:** add real test-user authentication through the Go service, local email
handling and isolated persistent state. Exercise create → nested VPC/AZ resize →
save → reload → duplicate/delete subtree. Test unknown AI node metadata through
persistence using deterministic AI output; no paid provider calls needed.

**Acceptance:** tests assert saved geometry/metadata after reload and fail on data
loss, missing auth, server errors and browser runtime exceptions. Keep anonymous
smoke as its own useful check.

### OSS-09 — P2: user-facing docs and community routes are inconsistent

**Evidence:** README still describes Postgres canvas upserts, old database URLs,
insufficient local prerequisites, and blanket “battle-tested” claims. It lists
`docker-compose down -v` among ordinary commands without describing data loss.
Contributing instructs feature branches from `develop`, absent from the fetched
remote refs. `.github/ISSUE_TEMPLATE/config.yml` links Discussions, but GitHub
reports Discussions disabled. PR-template relative policy links resolve inside
`.github/`, where those files do not exist.

**Action:** document the actual DynamoDB topology and one tested setup path;
distinguish evidence-backed guarantees from goals. Use `down` for routine shutdown
and explain volume deletion separately. Align contribution base branch and links;
enable Discussions deliberately or remove that route.

**Acceptance:** another person follows README from a clean environment, all
advertised community destinations work, and docs match the runtime and commands.

### OSS-10 — P2: ownership and release policies need operational verification

**Evidence:** CODEOWNERS uses `@VMedia` and stale `server/modules/auth/` and
`shared/` paths. The actual owner identity/permissions were not verified, so do
not assume the username is invalid merely because the repository uses another
owner name. `main` is protected, but previous direct pushes were allowed by
bypass; required-review enforcement is not established by that boolean.

`SECURITY.md` supports only `1.12.x`, while latest public release is `v1.11.0`.
The release job depends on successful private EC2 deployment, coupling public
source releases to one operator's infrastructure. DCO sign-off is requested but
no DCO enforcement workflow is present in the tracked configuration. Security and
conduct contact mailboxes and the promised response times were not verified.

**Action:** verify owner write permissions and current paths; check actual required
checks/review rules and maintainer bypass policy. Align supported versions with
published releases. Separate source release from optional deployment and guard
deploy jobs on forks. Verify the listed contact inboxes; state realistic response
targets. Choose and consistently apply a DCO policy. Private reporting is already
enabled; do not waste work re-enabling it.

**Acceptance:** a fork PR runs useful checks without production secrets; review
routing reaches a maintainer; public releases can be built/tagged without EC2;
security policy covers the release users can actually download.

### OSS-11 — P2: licensing exists, but redistribution provenance is incomplete

**Evidence:** root MIT LICENSE and package metadata agree. There is no tracked
third-party notice inventory. Lockfile metadata includes Apache-2.0 and CC-BY-4.0
as well as MIT and other licenses, with 55 entries unspecified. Bundled imagery
includes `client/public/logos/oracle.png`, hero/carousel images and preview art.
Their original sources/permissions are not documented in a dedicated inventory.

**Action:** inventory actual distributed npm/Go dependencies, icons, images and
fonts; review missing metadata; preserve applicable upstream notices and record
asset sources. Treat the README trademark disclaimer as a disclaimer, not proof
that every asset can be redistributed. Review upstream terms such as the
[Simple Icons disclaimer](https://github.com/simple-icons/simple-icons/blob/develop/DISCLAIMER.md)
where that source actually applies. This audit is not a legal determination.

**Acceptance:** every shipped asset has a recorded source and applicable terms;
required notices accompany browser bundles, images and release artifacts.

### OSS-12 — P2: supply-chain and lint checks need tighter boundaries

**Evidence:** workflows use mutable tags and `trufflesecurity/trufflehog@main`.
Dependabot exists for npm, Go, Actions and Docker, which is a good foundation.
ESLint scans local `.kilo` worktree copies, while its config excludes `scripts/**`
including the new setup helper. Default logging produces thousands of warnings
without failing. A clean fresh-install/lint comparison was not run here.

**Action:** pin privileged third-party Actions to reviewed SHAs and update through
Dependabot; review job token permissions. Exclude local agent caches consistently
from lint/format/build context. Add focused checking for operational scripts and a
measured warning baseline, then reduce high-value warnings gradually.

**Acceptance:** fresh and ordinary developer checkouts inspect the same intended
sources; new security/setup issues fail checks; Actions changes remain reviewable.
See GitHub's [secure Actions guidance](https://docs.github.com/en/actions/reference/security/secure-use).

### OSS-13 — P1: current Go lint gate also fails in remote CI

**Evidence:** the completed CI run for the audited SHA reports failure in
`Auth Service Checks / Lint (golangci-lint)`, at `Verify configuration and lint`.
Go race tests and the Go security scan succeeded. The Node lint pass does not
cover this separate gate. The exact Go lint diagnostics were not retrieved in
this audit, so the root cause is not established here.

**Action:** inspect that job's log, reproduce with its pinned Go/linter versions,
and correct the reported code or configuration issue without weakening the gate.

**Acceptance:** Go lint and all required checks succeed on the release candidate;
application and Docker builds execute instead of being skipped by failed needs.

## Suggested implementation batches

Keep fixes reviewable and commit each coherent change separately. Credential
rotation is an operational task, not a commit containing replacement secrets.

| Queue | Work                                                                                    | Completion evidence                                         |
| ----- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Q0    | Privately resolve historical credential exposure (OSS-01)                               | Rotation/retirement record and triaged scan                 |
| Q1    | Fix build, system-test discovery and Go lint (OSS-02, OSS-03, OSS-13; separate commits) | Clean build; five system cases actually run; Go lint passes |
| Q2    | Repair setup generation/recovery, BYOK env, and dev Compose (OSS-04–06)                 | Clean Windows/Linux setup and container smoke               |
| Q3    | Make assertion verification public-key-only (OSS-07)                                    | Cross-runtime verification/rotation regression tests        |
| Q4    | Add authenticated canvas persistence browser tests (OSS-08)                             | Real save/reload checks with local services                 |
| Q5    | Correct docs, owner routing, support and release policy (OSS-09–10)                     | Contributor walkthrough and verified GitHub settings        |
| Q6    | Asset/dependency notices and workflow/lint boundaries (OSS-11–12)                       | Shipped-file inventory and stable checks                    |

## Release acceptance checklist

- [ ] Historical credential rotation/retirement is verified privately.
- [ ] Clean clone builds; system suite discovers and executes its tests.
- [ ] Documented local setup requires no private infrastructure or paid keys.
- [ ] Registration/login and canvas save/reload pass with real local services.
- [ ] Verifier configuration contains only public assertion keys.
- [ ] Public support policy matches a published release and reachable contacts.
- [ ] Asset provenance and applicable third-party notices are recorded.
- [ ] CI is green on the candidate SHA, including Docker, system and browser jobs.
- [ ] README explicitly states remaining limitations and supported deployment mode.

Do not treat more badges, a higher package version, or a green fast-test suite as
a substitute for these checks. After these are met, describing the project as an
open-source beta with a reproducible contributor setup would be well supported.
