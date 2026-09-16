# deploy/ — Infrastructure Artifacts Only

Scripts live in [`/scripts`](../scripts). The **deployment runbook** is
[`docs/operations/DEPLOYMENT.md`](../docs/operations/DEPLOYMENT.md); the secrets inventory is
[`docs/operations/SECRETS.md`](../docs/operations/SECRETS.md).

## Files in this folder

| File               | Purpose                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nginx.conf`       | Production reverse proxy config for the EC2 host (static frontend, `/api/v1/(auth\|user)/` → Go auth :8081, rest → monolith :5000, `/ws` upgrade) |
| `ec2-user-data.sh` | First-boot provisioning: Docker, NGINX, base tooling                                                                                              |
| `rds-setup.md`     | AWS CLI commands for managed RDS if you outgrow on-instance Postgres                                                                              |

Quick links:

- Deploy: `./scripts/deploy.sh` (local dist-swap) or push to `main` (GitHub Actions)
- Start/stop instance: `~/start-ec2.sh`
- Architecture of the auth split: [`docs/AUTH_ARCHITECTURE.md`](../docs/AUTH_ARCHITECTURE.md)

`nginx.conf` contains an application-root path that must match the target host
before installation. Validate with `sudo nginx -t`; the canonical deployment
directory is documented in [`DEPLOYMENT.md`](../docs/operations/DEPLOYMENT.md).
