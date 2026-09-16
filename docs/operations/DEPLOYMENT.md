# Meshwork Studio — Production Deployment Guide

> Canonical runbook for the production EC2 instance. Secrets inventory lives
> in [`SECRETS.md`](./SECRETS.md). Day-to-day start/stop lives in
> [`EC2_OPERATIONS.md`](./EC2_OPERATIONS.md).

---

## Production facts

| Resource       | Value                                                  |
| -------------- | ------------------------------------------------------ |
| Instance       | `<YOUR_EC2_INSTANCE_ID>` — Ubuntu 22.04 LTS, us-east-1 |
| SSH            | `ssh -i <YOUR_SSH_KEY> ubuntu@<YOUR_DOMAIN>`           |
| Public URL     | `https://<YOUR_DOMAIN>` (NGINX + TLS)                  |
| Remote app dir | `/home/ubuntu/meshwork-studiov2`                       |
| Env file       | `/home/ubuntu/meshwork-studiov2/.env` (chmod 600)      |

### Runtime topology on the box

```
NGINX :80/:443 ── TLS termination, static frontend
 ├─ /api/v1/auth/* , /api/v1/user/*  → Go auth service  (PM2 meshwork-auth, :8081)
 ├─ /api/* , /health , /ready        → Node monolith    (PM2 meshwork,     :5000)
 └─ /ws                              → Node monolith (WebSocket upgrade)

Docker: emnesh-postgres-workspace (:5434), emnesh-postgres-auth (:5433),
        emnesh-redis (:6379)
```

The **Go auth service** (`server/services/auth`) owns users, sessions, MFA, OAuth and
audit. The monolith only validates sessions through its auth bridge.
Architecture details: [`../AUTH_ARCHITECTURE.md`](../AUTH_ARCHITECTURE.md).

---

## Deploy path A — GitHub Actions (preferred)

`.github/workflows/deploy-production.yml` triggers on push to `main`:

1. Builds the client+monolith bundle (`npm run build`)
2. Cross-compiles the Go auth binary (`linux/amd64`, migrations embedded)
3. SCPs `dist/`, manifests and `meshwork-auth` to the instance
4. Runs `scripts/deploy-remote.sh` on the instance (dist swap + PM2 reload)
5. Installs/restarts `meshwork-auth` under PM2, probes `127.0.0.1:8081/healthz`
6. Health-gates the deploy, then runs Playwright `@smoke` E2E

Required repo secrets: `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `VITE_API_URL`.

## Deploy path B — local dist-swap (manual / emergency)

```bash
./scripts/deploy.sh               # builds everything, ships both artifacts
./scripts/deploy.sh --skip-build  # reuse existing dist/
./scripts/deploy.sh --skip-auth   # monolith-only change
```

The script rsyncs `dist/`, uploads `meshwork-auth` to a staging dir, performs
atomic swaps (`dist.old` / `meshwork-auth.old` kept for instant rollback),
reloads both PM2 processes and prints health status for :5000 and :8081.

> First time enabling the auth service on the box? Ensure its env vars exist
> in the remote `.env` (`AUTH_*` namespace — see
> [`SECRETS.md`](./SECRETS.md)) and NGINX carries the identity location block
> from `deploy/nginx.conf`.

---

## Verification checklist

```bash
# On the server:
pm2 ls                                # expect: meshwork, meshwork-auth online
curl -s localhost:5000/health         # {"status":"healthy",...}
curl -s localhost:8081/healthz        # {"status":"healthy",...}
sudo nginx -t && sudo systemctl reload nginx

# End-to-end auth smoke test (from anywhere):
BASE=https://<YOUR_DOMAIN>
CSRF=$(curl -s -c /tmp/cj $BASE/api/v1/auth/csrf-token | jq -r .csrfToken)
curl -s -b /tmp/cj -c /tmp/cj -X POST $BASE/api/v1/auth/register \
  -H "Origin: $BASE" -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"smoke+$RANDOM@example.com\",\"password\":\"SmokeTest123!\"}"
# → 201 with user JSON means auth service + DB + cookies all work
```

## Rollback

| Failure          | Action                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monolith bad     | `ssh … 'cd ~/meshwork-studiov2 && rm -rf dist && mv dist.old dist && pm2 reload meshwork'`                                                                          |
| Auth service bad | `mv meshwork-auth.old meshwork-auth && pm2 restart meshwork-auth`                                                                                                   |
| Routing bad      | revert the `/api/v1/(auth\|user)/` location block in `/etc/nginx/sites-available/*` back to `proxy_pass http://127.0.0.1:5000;` — sessions are valid on both stacks |
| GHA deploy bad   | re-run the workflow on the previous commit                                                                                                                          |

Sessions are shared opaque tokens hashed in `auth_db`: either stack validates
them, so rolling back never logs users out.

## Fresh instance bootstrap

`deploy/ec2-user-data.sh` provisions Docker, NGINX and base tooling on first
boot; `deploy/rds-setup.md` covers managed-Postgres setup if you outgrow the
on-instance containers. After first boot:

1. Clone the repo to `~/meshwork-studiov2`
2. Create `.env` from the inventory in [`SECRETS.md`](./SECRETS.md)
   ⚠️ Database cutover note: the consolidated Postgres starts EMPTY.
   Run `npx tsx scripts/provision-dynamodb.ts` for the canvas table.
   Existing canvas/team/ai rows are NOT migrated (fresh start).
   (generate every key listed there — no defaults exist). The auth
   service's `AUTH_ASSERTION_PRIVATE_KEY` and the monolith's
   `AUTH_ASSERTION_PUBLIC_KEY` must be generated as one keypair.
3. Run `./scripts/deploy.sh`
4. Point the DNS record at the instance's public IP / Elastic IP
