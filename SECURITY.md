# Security Policy

## Supported Versions

Only the latest release branch and active development on `main` receive security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.12.x  | :white_check_mark: |
| 1.11.x  | :x:                |
| < 1.11  | :x:                |

---

## Reporting a Vulnerability

We take the security of Meshwork Studio seriously. If you discover a security vulnerability, **please do not disclose it publicly** in an issue, pull request, or forum until it has been reviewed and addressed.

### Preferred Disclosure Method: GitHub Private Vulnerability Reporting

Please submit a private report via [GitHub Security Advisories](https://github.com/Andiewitz/Meshwork-Studio/security/advisories/new).

This creates an encrypted workspace where we can discuss the issue, assess the severity, collaborate on a patch, and coordinate release timing before public disclosure.

### Alternative Method: Direct Security Contact

If you cannot use GitHub Security Advisories, contact the project maintainers via email at:
`security@meshwork.studio` (or via GitHub direct maintainer contact).

### What to Include in Your Report

To help us triage and resolve the issue quickly, please provide:

1. **Description**: Clear description of the vulnerability and potential impact.
2. **Steps to Reproduce**: A minimal proof-of-concept (PoC) script, HTTP request dump, or step-by-step reproduction instructions.
3. **Affected Components**: Which service or module is affected (e.g., Go auth service, Express monolith, React canvas, WebSocket server).
4. **Environment**: Version, OS, browser, or deployment configuration where the issue occurs.
5. **Mitigation**: Any potential mitigations or suggested fixes you have identified.

---

## Response Process & SLAs

- **Acknowledgement**: We aim to acknowledge receipt of all vulnerability reports within **48 hours**.
- **Assessment**: We will investigate and confirm the issue within **5 business days**, providing an initial severity rating (CVSS).
- **Remediation**: We coordinate patches privately, backport to supported versions, and publish an official GitHub Security Advisory with CVE assignment where appropriate.
- **Credit**: Security researchers who report vulnerabilities responsibly will be credited in the advisory release notes (unless anonymity is requested).

---

## Architecture & Defense-in-Depth

Meshwork Studio implements a comprehensive multi-tier security model:

- **Authentication**: Dedicated Go identity service with Argon2id hashing, ed25519-signed session assertions, and PKCE OAuth.
- **Authorization**: Resource ownership verification on every data endpoint to prevent IDOR attacks.
- **Data Protection**: AES-256-GCM encryption at rest for sensitive credentials (BYOK AI keys and MFA secrets).
- **Transport & Network**: Progressive brute-force lockouts, CSRF protection via double-submit tokens, strict CORS, and rate limiting.

For complete documentation on our threat model and implementation details, see [docs/SECURITY.md](./docs/SECURITY.md) and [docs/AUTH_ARCHITECTURE.md](./docs/AUTH_ARCHITECTURE.md).
