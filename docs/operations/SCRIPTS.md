# Meshwork Studio — Scripts Guide

> Status: active · Updated: 2026-10-12 · Context: the only two scripts you
> need day-to-day are `start` and `deploy`. Everything else is a helper.

## The 10-second version

| You want to…                             | Run                                                  |
| ---------------------------------------- | ---------------------------------------------------- |
| Wake the EC2 / push last build / restart | `meshwork-start` (no build, fast)                    |
| Put new code live                        | `meshwork-deploy` (builds, then ships)               |
| Open the metrics dashboard locally       | `npm run dashboard` (needs dev server + admin login) |

Changed code? → **deploy**. Reboot, crash, or stale services? → **start**.

## One-time global setup

```bash
./scripts/install-global.sh   # adds meshwork-start + meshwork-deploy to ~/.local/bin
```

Works from any directory afterwards. `./scripts/install-global.sh --uninstall`
removes them. Without it, use `./scripts/start.sh` / `./scripts/deploy.sh`
from the repo root (or `npm run start:ec2` / `npm run deploy`).

## `meshwork-start` — open the shop, no cooking

Pushes your **current** `dist/` as-is and starts everything. Never builds.

```bash
meshwork-start              # push dist/, start EC2 + services, health-check
meshwork-start --no-push    # start services only (no upload)
meshwork-start --ssh        # …then drop into an SSH shell
meshwork-start --help       # help
```

What it does, in order (`▶ [1/5]` … `▶ [5/5]`):

1. Checks local `dist/index.cjs` exists (fails fast with "run deploy first").
2. Wakes the EC2 via AWS CLI if stopped, waits for SSH (spinner + bar).
3. Uploads `dist/` → `dist.new`, atomically swaps (`dist.old` kept).
4. Starts Docker (`meshwork-postgres`, `meshwork-redis`, `meshwork-dynamodb-local`),
   nginx, and PM2 apps with `restart` (no downtime for a mere start).
5. Probes `:5000/health` + `:8081/healthz`, prints a summary.

## `meshwork-deploy` — cook fresh, deliver live

For when you changed code and want it on the live site.

```bash
meshwork-deploy               # build everything & deploy
meshwork-deploy --skip-build  # push existing dist/ (no rebuild)
meshwork-deploy --skip-auth   # skip the Go auth binary
meshwork-deploy --help        # help
```

Adds two steps over `start`: `npm run build` (client + server bundle) and a
`linux/amd64` Go auth build, plus a **stale-dist guard** — if the remote `dist`
is newer than local, it asks before overwriting (prevents rolling live back).
Restart uses `pm2 delete/start` so the new bundle loads with fresh env
(brief downtime — correct for a code deploy).

## Configuration (env vars)

| Var                        | Meaning                           | Default     |
| -------------------------- | --------------------------------- | ----------- |
| `MESHWORK_DOMAIN`          | EC2 hostname (preferred target)   | —           |
| `MESHWORK_EC2_INSTANCE_ID` | e.g. `i-0abc…` (power-on via AWS) | —           |
| `MESHWORK_SSH_USER`        | SSH user                          | `ubuntu`    |
| `MESHWORK_SSH_KEY`         | Key path (first existing wins)    | auto-search |
| `AWS_REGION`               | EC2 region                        | `us-east-1` |
| `REMOTE_APP_DIR`           | Remote app dir override           | auto-detect |
| `NO_COLOR`                 | Set to disable colours/bar art    | —           |

Key auto-search: `$MESHWORK_SSH_KEY` → `ssh-keys/Mesh-EC2.pem` →
`~/.ssh/meshwork.pem` → `~/.ssh/id_rsa` → `~/.ssh/id_ed25519`.

## Reading the TUI

- `▶ [2/5]` — current step. `✓` done, `⚠` warning, `❌` failure.
- `⠋ 12s` — spinner with elapsed time (waiting on something remote).
- `████░░░░ 45%` — progress bar with counts.
- If the EC2 can't be found or reached, the script **tells you what's
  missing** (which var, what to export) instead of dying cryptically.

## Troubleshooting

| Symptom                                         | Fix                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| "Couldn't find your EC2"                        | `export MESHWORK_DOMAIN=…` or `MESHWORK_EC2_INSTANCE_ID=…`         |
| "Couldn't reach your EC2"                       | Instance stopped? Port 22 blocked? Wrong key? (it lists all three) |
| "dist/ or dist/index.cjs missing"               | Run `meshwork-deploy` (builds) instead of `start`                  |
| "Remote dist is NEWER"                          | Someone deployed newer code — confirm before overwriting           |
| `meshwork-start: command not found`             | Run `./scripts/install-global.sh`, restart shell                   |
| Script edited but global still runs old version | Symlinks point at the repo — no reinstall needed                   |

## The rest of `scripts/` (helpers, not daily use)

| Script / command                  | Purpose                                              |
| --------------------------------- | ---------------------------------------------------- |
| `npm run setup`                   | Generate local-only `.env` (dev keys, never prod)    |
| `npm run dev`                     | Local dev server (`scripts/dev.ts`)                  |
| `npm run build`                   | Production bundle (`scripts/build.ts` → `dist/`)     |
| `npm run diagnose`                | 20 config checks for Node + Go auth (run on doubt)   |
| `npm run db:backup`               | Fail-closed Postgres + DynamoDB archive to S3        |
| `npm run db:restore:drill`        | Restore drill into **isolated** targets only         |
| `scripts/provision-dynamodb.mjs`  | Create the canvas table (local or AWS)               |
| `scripts/install-backup-timer.sh` | Install systemd backup timer on EC2                  |
| `scripts/no-auth-bypass.sh`       | CI guard: fails on `E2E_BYPASS_AUTH` in runtime code |
| `scripts/deploy-remote.sh`        | Runs **on EC2**, invoked by GitHub Actions (not you) |
| `scripts/lib/ec2-common.sh`       | Shared SSH + TUI helpers (sourced, never run)        |

GitHub Actions (`deploy-production.yml` / `deploy-staging.yml`) is a separate
robot path: CI builds, SCPs artifacts, runs `deploy-remote.sh` on the box.
Your local `meshwork-deploy` does the same job by hand for emergencies.
