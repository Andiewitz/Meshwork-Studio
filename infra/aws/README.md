# AWS additions for the existing EC2 deployment

Status: implemented locally; AWS deployment and live verification pending.

This root adds Cognito Lite, encrypted SQS email delivery, Lambda/SES workers,
S3 database backup storage, CloudWatch logs/dashboard/alarms, scheduled health
and backup checks, SNS alerts, SSM configuration/access, a budget, and a GitHub
OIDC deployment role. It does not create or replace EC2, PostgreSQL, Redis,
the canvas table, NGINX, or the application's existing auth accounts.

## Prepare and verify locally

```powershell
cd infra/aws/functions
npm ci
npm test
npm run build
cd ..
terraform init -backend=false
terraform fmt -check -recursive
terraform validate
terraform test
```

The tests use a mocked AWS provider and real local Lambda packages. They do
not need AWS credentials, create resources, or prove live AWS permissions.
Commit both the Terraform provider lock file and Lambda npm lock file.

Copy `terraform.tfvars.example` to `terraform.tfvars` and supply the actual
account ID, existing EC2 ID, its attached IAM role name, public HTTPS origin,
sender domain/address, and alert recipient. Review the $5 addon and $30 account-wide budget
defaults against your actual existing bill before applying. Remove local
`AWS_ACCESS_KEY_ID=local`/`AWS_SECRET_ACCESS_KEY=local` values from EC2's
environment so the SDK can use its instance role. Configure AWS credentials in
the Terraform execution environment. Terraform uses its own provider; AWS CLI is not
required on the developer machine. The existing EC2 must have an IAM role and
SSM Agent; create/attach a profile separately if it currently has none.

If GitHub OIDC already exists in the account, set `github_oidc_provider_arn`.
The Terraform operator needs `kms:CreateGrant` for the Cognito custom sender,
in addition to the normal permissions to manage these resources. The
application/deployment roles are intentionally not Terraform administrator roles.

Use `terraform plan -out=foundation.tfplan` with real credentials, inspect it,
then `terraform apply foundation.tfplan` in the chosen execution environment.
No apply is performed by the verification workflow. Local state contains
resource details: keep it private and backed up. For shared operations,
bootstrap a separate private/versioned/encrypted state bucket and configure
the S3 backend with `use_lockfile = true` before sharing state. Do not apply
the archived Terraform or mix state with expiring database archives.

## Activate email and hosted login

1. Publish `terraform output -json ses_dkim_records` at the existing DNS provider.
   DNS is intentionally not moved to Route 53.
2. Verify the sender in SES and request production access in this region if
   arbitrary recipients are needed. Check the account's SES pricing plan.
3. Deploy the updated application and Go service using the existing process.
   The root application build also builds the SDK-backed backup/config runners.
4. Copy the three `COGNITO_*` entries from `runtime_parameters` into the Go
   process environment, or run it through `dist/recovery/with-aws-env.cjs` as
   shown below. The login/register page discovers the configured provider from
   `/api/v1/auth/providers` and displays the additional account button.
5. Start at the application's `/api/v1/auth/cognito?returnTo=/home`, not a
   direct Cognito callback URL: the app creates browser-bound state and PKCE.
   Cognito's hosted pages handle signup, code entry, resend, reset, and TOTP.

```bash
node dist/recovery/with-aws-env.cjs /meshwork-prod/runtime pm2 restart meshwork-auth --update-env
```

Existing password/Google login remains available, including its existing SMTP
settings. Legacy auth messages still use SMTP: the queue sends Cognito's
messages. Existing accounts are not silently merged on email. To link one,
first sign in using its existing method, then visit
`/api/v1/auth/cognito?link=true&returnTo=/home` in the same browser and sign
in to Cognito with the same verified email address. Identity resolution and
creation are transactional. Local user IDs/admin/team/workspace grants remain
unchanged. Bulk migration and retiring local password auth are not automated.

The bridge retains local HttpOnly cookies, CSRF protection, signed assertions,
and local session revocation. It discards upstream tokens after the exchange
and caps local session absolute expiry at the upstream access token expiry
(at most 15 minutes). Reauthentication uses the hosted login. Cognito-side
disable/global sign-out is not an immediate revocation of local sessions;
local logout-all remains the immediate app control, subject to existing signed
assertion expiry/revocation behavior. Local logout does not sign out Cognito's
hosted-browser session. Do not claim these are identical session systems.

The queue worker supports Cognito signup/resend/reset/attribute verification,
temporary-password invites, email authentication, and takeover notifications.
Queue codes remain encrypted until the worker; bodies/codes are not logged.
It checks user-pool encryption context, drops jobs older than 15 minutes,
deduplicates acknowledged deliveries, leases active jobs, and enforces a
shared daily attempt limit. Delivery is at least once: a crash between SES
acceptance and marking the job sent can duplicate an email. The attempt cap
also counts failures. Do not automatically redrive expired verification mail.
Permanent bounce/complaint suppression persists until explicitly cleared.

## Backups and observability

The backup uploader now uses the AWS SDK; neither it nor the runtime config
loader needs AWS CLI. PostgreSQL dump tools and the instance role are still
required. Set `BACKUP_S3_URI` from Terraform in `.env` used by the systemd
backup service. Keep all existing database DSNs and the globals URL. Enable
PITR on the existing canvas table before running a production backup; this
root deliberately does not assume ownership of that table.

Run `npm run db:backup`, verify the uploaded manifest, then install the existing
nightly timer with `scripts/install-backup-timer.sh`. The S3 lifecycle expires
daily archives after 14 days by default, older overwritten versions after
seven days, and orphaned multipart uploads after a day. Versioning is not
immutability. The EC2 role cannot delete or restore archives; use a distinct
operator role for isolated restore drills.

The backup monitor runs every six hours and requires the six expected archive
files plus matching object sizes. It examines the last three days of archives.
It does not download and checksum full dumps or execute database restores:
use `scripts/restore-drill.ts` for that. An overdue backup emits a high age;
missing monitor metrics also alarm. Readiness is probed over public HTTPS
every five minutes without a VPC/NAT gateway.

Confirm the SNS email subscription. Install AmazonCloudWatchAgent through
SSM Distributor (`AWS-ConfigureAWSPackage`) or AWS's supported Ubuntu package,
then start it with the parameter named by `cloudwatch_agent_parameter`:

```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -c ssm:/meshwork-prod/cloudwatch-agent -s
```

The configuration assumes the documented ubuntu PM2 paths and one root disk;
check the actual host before activation. It exports two aggregated host series
and collects Node JSON logs, both Go streams, and NGINX errors. The log filter
counts Node error-level records, not an exact count of HTTP 5xx responses.
The eight standard alarms cover EC2 status, disk, availability, backup age,
email DLQ/backlog, Lambda invocation errors, and application errors. Handled
partial-batch email failures appear in logs/backlog/DLQ; Lambda's `Errors`
metric alone does not count them. App/Lambda logs retain seven days;
operational logs retain 30 days.

## GitHub deployment access

`.github/workflows/aws-foundation.yml` validates/tests without AWS credentials
on changes and fork PRs. Its manual activation job uses OIDC restricted to the
repository's `production` environment and `main`. Protect that GitHub environment
and set repository variables `AWS_DEPLOY_ROLE_ARN`, `AWS_INSTANCE_ID`,
`AWS_DEPLOY_DOCUMENT`, and `AWS_REGION` from this root's outputs/settings.

Export `terraform output -raw deploy_wrapper`, review it, then install it
root-owned and executable at `/usr/local/sbin/meshwork-deploy` on EC2. The
SSM document calls only that wrapper and grants no arbitrary command document.
It runs application work as ubuntu and fetches runtime configuration through
the instance role. The OIDC role can invoke only this document on this instance.

**This workflow activates already staged artifacts.** The existing build and
SCP transfer workflow remains the source of application artifacts and still
uses SSH until a separate artifact-transfer migration is implemented. Do not
run manual activation concurrently with the existing production deployment.
OIDC activation does not install the wrapper, bootstrap agents, or grant the
runner Terraform apply permissions.

## Live acceptance checks after apply

- Complete signup and receive/enter a code; exercise resend and password reset.
- Reject wrong/expired codes and demonstrate two users cannot claim one identity.
- Link an existing account and verify the same workspace/admin permissions.
- Exercise local logout-all and an active WebSocket session.
- Induce a worker failure using a test identity; observe retry and DLQ alarms.
- Send via the SES mailbox simulator to exercise delivery feedback/suppression.
- Create a complete backup, check its freshness metric, and perform an isolated
  restore drill before treating recovery as verified.
- See host logs/metrics in CloudWatch, confirm an SNS test notification, and
  exercise the public-probe alarm with a controlled non-production failure.

Expected additions at low volume are roughly $1–$3/month under the assumptions
in `plans/AWS-PORTFOLIO-PLAN.md`, excluding existing EC2/EBS/IPv4. The custom
sender key alone starts at $1/month. S3/SES/PITR are metered; free allowances
are shared across the account. The budget emails are alerts, not a spending
cap. Async exports, Step Functions, and canvas-worker migration remain later
features; they are not deployed by this root.

## Local verification record — 2026-10-26

- Terraform 1.16.2: formatting and validation passed; both mocked plan tests passed.
  Provider lock includes Windows and Linux amd64 checksums.
- Lambda workers: all 12 tests passed and all four deployment bundles built.
- Application: all 397 unit/integration tests passed; TypeScript check and
  production build passed. The final SDK backup runner also compiled separately.
- Go auth: `go test ./...` and `go vet ./...` passed, including provider,
  verification-token, and OAuth return-path regression checks.
- Edited auth page lint: no errors; five existing warnings remain.
- npm installation reports 11 existing root dependency advisories (four high);
  the separate Lambda package audit reported zero vulnerabilities.

No real AWS plan/apply, live SES/Cognito test, CloudWatch-agent smoke test, or
database-backed restore was performed. Docker's local daemon was unavailable.
The live checks above remain required after supplying deployment values and
credentials. Passing mocked Terraform tests does not prove live IAM/service
configuration or migrate existing production identities.

# Architecture plan storage

Terraform provisions a private, encrypted S3 bucket for AI architecture plans and grants the existing EC2 role access under `projects/`. Set `ARTIFACT_S3_BUCKET` in the application runtime to the `architecture_plans_bucket` output (or load the runtime SSM parameter), and set `AWS_REGION` to the bucket region. Applying Terraform and restarting the application are required before plans can be saved. Plans and their readable Markdown are stored together as JSON objects. Deleting a project purges its plan objects. S3 storage and request charges may apply; this does not provision a database.
