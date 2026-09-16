# Contributing to Meshwork Studio

Welcome! Thank you for taking the time to contribute to Meshwork Studio.

Meshwork Studio is an open-source visual cloud architecture platform built with TypeScript, React Flow, Node.js, and Go. We welcome all contributions: bug fixes, feature enhancements, documentation improvements, diagram templates, and UI refinements.

Please review our [Code of Conduct](./CODE_OF_CONDUCT.md) before participating.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Local Development Setup](#local-development-setup)
4. [Development Commands](#development-commands)
5. [Architectural Boundaries](#architectural-boundaries)
6. [Testing Strategy](#testing-strategy)
7. [Branch Strategy & Commit Conventions](#branch-strategy--commit-conventions)
8. [Pull Request Process](#pull-request-process)
9. [Developer Certificate of Origin](#developer-certificate-of-origin)

---

## Architecture Overview

Meshwork Studio uses a **dual-runtime modular architecture**:

- **Frontend (`client/`)**: React 18, Vite, React Flow, TanStack Query, Tailwind CSS, Radix UI.
- **Monolith API (`server/`)**: Express 5 on Node 22, Drizzle ORM, Zod validation, WebSocket live presence.
- **Auth & Identity Service (`server/services/auth`)**: Dedicated Go service (`:8081`) managing users, sessions, MFA (TOTP), PKCE OAuth, and audit logs. The Node monolith verifies sessions via signed ed25519 assertions.
- **Data Layer**:
  - **PostgreSQL**: Isolated database-per-service (`workspace_db`, `auth_db`, `team_db`, `ai_db`, `metrics_db`).
  - **DynamoDB Local / DynamoDB**: Canvas documents (nodes, edges, spatial containment).
  - **Redis**: Session caching, rate limiting, WebSocket pub/sub.

---

## Prerequisites

- **Node.js**: `v20.19.0` or higher (`v22` recommended)
- **npm**: `v10` or higher
- **Docker & Docker Compose**: For running local Postgres, Redis, and DynamoDB Local
- **Go**: `v1.26+` (optional for local host builds — Go auth service can also run via Docker)

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Andiewitz/Meshwork-Studio.git
cd Meshwork-Studio
```

### 2. Run Automated Environment Setup

Run the setup script to install dependencies and automatically generate development configuration:

```bash
npm install
npm run setup
```

This creates one valid root `.env` with automatically generated local
cryptographic keys. The Node app receives an Ed25519 public verification key;
the Go identity service receives the private signing seed.

### 3. Start Infrastructure Services

Start the complete supported development stack:

```bash
docker compose up --build
```

The app is available at `http://localhost:5000`. This path includes the required
Go identity service. For native Node/Go development, keep the three data
containers running, run `make -C server/services/auth run`, then run `npm run dev`
in another terminal.

---

## Development Commands

| Command                 | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `npm run dev`           | Starts Node API and Vite frontend with HMR on `:5000`        |
| `npm run check`         | Runs TypeScript compiler type checking                       |
| `npm run lint`          | Runs ESLint across full workspace                            |
| `npm run lint:fix`      | Automatically fixes fixable ESLint issues                    |
| `npm run format`        | Checks code formatting with Prettier                         |
| `npm run format:fix`    | Formats files with Prettier                                  |
| `npm run test:run`      | Runs fast unit and integration tests                         |
| `npm run test:unit`     | Runs unit test suite                                         |
| `npm run test:coverage` | Runs tests and generates V8 coverage report                  |
| `npm run test:system`   | Runs DynamoDB and WebSocket system tests (requires DynamoDB) |
| `npm run test:e2e`      | Runs Playwright browser end-to-end tests                     |
| `npm run diagnose`      | Verifies required environment configuration                  |
| `npm run build`         | Bundles client and server for production                     |

---

## Architectural Boundaries

Meshwork Studio strictly enforces architectural isolation between services. A CI test (`tests/unit/arch/boundaries.test.ts`) verifies:

1. **No Cross-Database Access**: A service may not import or query another service's database pool or schema directly.
2. **Type Ports Only**: Cross-service interaction must occur through defined client adapters or type-only contracts (`import type { ... }`).
3. **No Auth Bypass Flags**: Runtime code must never include authentication bypasses.

---

## Testing Strategy

All new features and bug fixes must include tests:

- **Unit tests (`tests/unit/`)**: Pure functions, state stores, node geometry, encryption routines, and route handlers with mocks.
- **Integration tests (`tests/integration/`)**: Service boundaries and HTTP routes exercising middleware and database interactions.
- **System tests (`tests/system/`)**: Real interaction against local DynamoDB and WebSocket servers.
- **E2E tests (`tests/e2e/`)**: Playwright browser smoke tests verifying critical user journeys.

Run the test suite before submitting PRs:

```bash
npm run check
npm run lint
npm run test:run
```

## Documentation changes

Update the relevant documentation in the same pull request whenever a change
affects an API contract, authorization, persisted data, node registry,
environment variable, deployment, recovery, or user-visible capability. See
the [documentation maintenance guide](./docs/development/DOCUMENTATION.md) for
the source-of-truth map and review checklist.

---

## Branch Strategy & Commit Conventions

### Branch Strategy

- `main` — Production-ready code. Protected branch; changes require pull requests.
- `feat/<feature-name>` — New features branching from `main`.
- `fix/<bug-name>` — Bug fixes branching from `main`.
- `hotfix/<fix-name>` — Urgent fixes branching directly from `main`.

### Conventional Commits

We enforce the [Conventional Commits](https://www.conventionalcommits.org/) specification using Commitlint and Husky:

```
<type>(<scope>): <short summary>
```

**Common Types**:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Formatting, missing semi-colons, white-space
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvements
- `test`: Adding or correcting tests
- `chore`: Build tasks, package updates, auxiliary tools

**Examples**:

```
feat(canvas): add snap-to-grid toggle on toolbar
fix(auth): correct token refresh expiration race condition
docs(api): update OpenAPI spec for workspaces
test(canvas): add spatial containment collision tests
```

---

## Pull Request Process

1. Fork the repository and create your branch from `main`.
2. Write clean, readable code with descriptive variable names.
3. Verify that all automated checks pass locally:
   ```bash
   npm run check && npm run lint && npm run test:run
   ```
4. Push your branch and open a Pull Request using the provided template.
5. Provide a clear description of the problem solved, architectural implications, and manual verification steps.
6. Once submitted, GitHub Actions CI will run static analysis, security scans,
   Node and Go tests, the browser smoke test, coverage, and build verification.
   See [CI/CD operations](./docs/operations/CI_CD.md) for the current gates and
   failure-triage guidance.
7. Address any code review feedback gracefully.

---

## Developer Certificate of Origin

By contributing to Meshwork Studio, you assert that your contributions conform to the **Developer Certificate of Origin (DCO) 1.1**:

```
Developer Certificate of Origin
Version 1.1

By making a contribution to this project, I certify that:

(a) The contribution was created in whole or in part by me and I
    have the right to submit it under the open source license
    indicated in the file; or

(b) The contribution is based upon previous work that, to the best
    of my knowledge, is covered under an appropriate open source
    license and I have the right under that license to submit that
    work with modifications; or

(c) The contribution was provided directly to me by some other
    person who certified (a), (b) or (c) and I have not modified
    it.

(d) I understand and agree that this project and the contribution
    are public and that a record of the contribution (including all
    personal information I submit with it, including my sign-off) is
    maintained indefinitely and may be redistributed consistent with
    this project or the open source license(s) involved.
```

To indicate compliance, sign your commits using `git commit -s`.
