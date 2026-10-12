# EC2 Operations — running the live server

> Status: active · Updated: 2026-10-12 · Context: day-to-day care of the
> production EC2 box (start, stop, logs, restarts). Deploying new code lives in
> [`SCRIPTS.md`](./SCRIPTS.md) and [`DEPLOYMENT.md`](./DEPLOYMENT.md).

Think of the EC2 instance as the always-on computer that serves the website.
This guide is about keeping that computer happy. For the full production facts
table (ports, topology, app dir), see
[`DEPLOYMENT.md`](./DEPLOYMENT.md#production-facts).

## Quick reference

| Thing      | Value                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| Domain     | `https://<YOUR_DOMAIN>`                                                |
| AWS region | `us-east-1`                                                            |
| Instance   | `<YOUR_EC2_INSTANCE_ID>` (Ubuntu 22.04)                                |
| SSH        | `ssh -i <YOUR_KEY>.pem ubuntu@<YOUR_DOMAIN>` (key must be `chmod 400`) |
| App folder | `/home/ubuntu/meshwork-studiov2`                                       |

## Starting everything

One command wakes the box, starts services, and checks health:

```bash
meshwork-start              # push current dist/, start all, health-check
meshwork-start --no-push    # start services only (no upload)
meshwork-start --ssh        # start all, then open an SSH shell
```

(Without the global install: `./scripts/start.sh` with the same flags.)
Changed code? Run `meshwork-deploy` instead — `start` never builds.
Details: [`SCRIPTS.md`](./SCRIPTS.md).

**What it does behind the scenes:** starts the EC2 instance if stopped → waits
for SSH → starts Docker, nginx, and the PM2 apps → probes `/health`.

## Stopping the box (saves money)

When nobody needs the site, stop the instance so AWS stops billing compute:

```bash
aws ec2 stop-instances --instance-ids <YOUR_EC2_INSTANCE_ID> --region us-east-1
```

Or press Stop in the AWS console. Start again with `meshwork-start`.

## Deploying new code

Don't follow manual build/upload/restart steps — the scripts do it for you:

- New code → live: [`SCRIPTS.md`](./SCRIPTS.md) (`meshwork-deploy`)
- Full runbook (CI path, rollback, fresh box): [`DEPLOYMENT.md`](./DEPLOYMENT.md)

## Looking inside the box

```bash
ssh -i <YOUR_KEY>.pem ubuntu@<YOUR_DOMAIN>
```

Once in:

```bash
pm2 status            # are the apps running?
pm2 logs meshwork     # live backend logs
pm2 restart meshwork  # restart the backend
pm2 save              # remember state across reboots

docker compose ps               # are postgres/redis/dynamodb up?
docker compose logs --tail=100  # dependency logs

sudo nginx -t              # check nginx config syntax
sudo systemctl reload nginx

curl -i http://localhost:5000/health   # health, from inside
curl -i https://<YOUR_DOMAIN>/health   # health, from outside
```

Restart a dependency only after checking what failed (`docker compose ps`
first). For backups and disaster recovery, see [`RECOVERY.md`](./RECOVERY.md).
