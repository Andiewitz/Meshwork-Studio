# Deployment — putting code on the live server

> Status: active · Updated: 2026-10-12 · Context: the deep reference for
> releases. Daily commands live in [`SCRIPTS.md`](./SCRIPTS.md); server
> care in [`EC2_OPERATIONS.md`](./EC2_OPERATIONS.md).

## Production facts (canonical)

| Thing        | Value                                                            |
| ------------ | ---------------------------------------------------------------- |
| Instance     | `<YOUR_EC2_INSTANCE_ID>` — Ubuntu 22.04, `t3.small`, `us-east-1` |
| SSH          | `ssh -i <YOUR_SSH_KEY> ubuntu@<YOUR_DOMAIN>`                     |
| Public URL   | `https://<YOUR_DOMAIN>` (nginx + TLS)                            |
| App folder   | `/home/ubuntu/meshwork-studiov2`                                 |
| Secrets file | `/home/ubuntu/meshwork-studiov2/.env` (`chmod 600`)              |

How traffic flows on the box:

```text
nginx :80/:443 (ends TLS, serves the website files)
 ├─ /api/v1/auth/* , /api/v1/user/* → Go auth service (PM2 meshwork-auth, :8081)
 ├─ /api/* , /health , /ready       → Node app         (PM2 meshwork,     :5000)
 └─ /ws                             → Node app (live-canvas connections)
```

Postgres, Redis, and DynamoDB are private helpers behind the apps. The Go
auth service owns logins, sessions, MFA, and OAuth; the Node app only checks
sessions using a public key. Details:
[`../AUTH_ARCHITECTURE.md`](../AUTH_ARCHITECTURE.md).

## Path A — GitHub Actions (normal releases)

Pushing to `main` runs the `CI/CD Pipeline` workflow; on success it triggers
`Deploy to Production` (`develop` → staging). The robot:

1. Builds the website + app bundle (`npm run build`)
2. Compiles the Go auth program for Linux
3. Copies `dist/`, configs, and the auth program to the server
4. Runs `scripts/deploy-remote.sh` **on the server** (swaps folders, restarts)
5. Restarts the auth service, checks `:8081/healthz`
6. Checks the public `/health`, then runs browser smoke tests

Needs repo secrets: `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `VITE_API_URL`.
You never run `deploy-remote.sh` by hand — it's the robot's tool.

## Path B — deploy from your laptop (manual / emergency)

```bash
meshwork-deploy               # build everything & deploy live
meshwork-deploy --skip-build  # reuse existing dist/ (no rebuild)
meshwork-deploy --skip-auth   # app-only change, skip Go build
```

(Without global install: `./scripts/deploy.sh` with the same flags.)
What it does: builds locally → uploads `dist/` + auth program → swaps them
into place atomically (old copies kept as `dist.old` / `meshwork-auth.old`)
→ restarts both PM2 apps → prints health for `:5000` and `:8081`.
Full flag/table docs: [`SCRIPTS.md`](./SCRIPTS.md).

> First time turning on the auth service? Its `AUTH_*` settings must exist in
> the server `.env` (see [`SECRETS.md`](./SECRETS.md)) and nginx needs the
> identity block from `deploy/nginx.conf`.

## Did it work? (verification)

```bash
# On the server:
pm2 ls                                # expect: meshwork, meshwork-auth online
curl -s localhost:5000/health         # {"status":"healthy",...}
curl -s localhost:8081/healthz        # {"status":"healthy",...}

# Full login test, from anywhere (201 + user JSON = everything works):
BASE=https://<YOUR_DOMAIN>
CSRF=$(curl -s -c /tmp/cj $BASE/api/v1/auth/csrf-token | jq -r .csrfToken)
curl -s -b /tmp/cj -c /tmp/cj -X POST $BASE/api/v1/auth/register \
  -H "Origin: $BASE" -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"smoke+$RANDOM@example.com\",\"password\":\"SmokeTest123!\"}"
```

## Undoing a bad deploy (rollback)

| What broke       | Undo it with                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------- |
| App bad          | `ssh … 'cd ~/meshwork-studiov2 && rm -rf dist && mv dist.old dist && pm2 reload meshwork'`    |
| Auth bad         | `mv meshwork-auth.old meshwork-auth && pm2 restart meshwork-auth`                             |
| Routing bad      | Revert the `/api/v1/(auth\|user)/` block in nginx back to `proxy_pass http://127.0.0.1:5000;` |
| Robot deploy bad | Re-run the GitHub workflow on the previous commit                                             |

Rolling back never logs users out: sessions are shared tokens both stacks accept.

## Brand-new server (first boot)

1. `deploy/ec2-user-data.sh` installs Docker, nginx, base tools on first boot.
   `deploy/rds-setup.md` covers managed Postgres if you outgrow the box.
2. Clone the repo to `~/meshwork-studiov2`.
3. Write `.env` using [`SECRETS.md`](./SECRETS.md) — generate **every** key,
   no defaults exist. The auth service's `AUTH_ASSERTION_PRIVATE_KEY` and the
   app's `AUTH_ASSERTION_PUBLIC_KEY` must be one matching pair.
   ⚠️ The database starts **empty** — existing data is not migrated.
   Create the canvas table: `npx tsx scripts/provision-dynamodb.mjs`.
4. Run `meshwork-deploy`.
5. Point DNS at the instance's public / Elastic IP.
