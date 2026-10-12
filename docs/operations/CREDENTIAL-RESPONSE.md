# Historical Credential Response

Use this runbook when a secret was committed to Git history. Treat the value as
potentially exposed even when the file no longer exists at `main`.

## 1. Contain and rotate

1. Identify the affected service from the secret's name and the commit that
   introduced it. Do not paste the secret into tickets, chat, issues, commits or
   this document.
2. Revoke or rotate the credential in the owning service. For a database URL,
   replace the database user password and invalidate old connections. For a
   session-signing secret, generate a new value and invalidate active sessions.
3. Update the deployment secret store and restart only the affected services.
   Confirm the old credential no longer authenticates.
4. Review access logs from the exposure window where the provider offers them.

## 2. Verify the repository

Scan every reachable branch, tag, release asset, package artifact, workflow log,
and archived backup with an approved secret scanner. Triage findings privately.
Current-tree scans do not prove that a historical value is safe.

History rewriting is a separate decision. It can reduce accidental exposure but
does not revoke copied credentials, breaks existing clones, and must follow
rotation. If rewriting is required, coordinate with every maintainer and follow
GitHub's [sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

## 3. Record completion privately

Record only these facts in the incident tracker:

- affected secret category and service;
- exposure range and affected refs;
- rotation/revocation timestamp and operator;
- deployment verification result;
- scan scope and remaining remediation;
- whether history rewriting was performed.

Never record secret values, hashes that can enable offline attacks, private keys,
or screenshots containing credentials.
