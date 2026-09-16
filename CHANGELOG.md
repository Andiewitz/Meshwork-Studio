# [1.12.0](https://github.com/Andiewitz/Meshwork-Studio/compare/v1.11.0...v1.12.0) (2026-09-16)

### 🚀 Open Source Milestone

Meshwork Studio is officially open-sourced! This release consolidates all architectural modernizations developed since v1.11 into a production-grade, community-ready release.

### Architecture & Security

- **Go Identity Service**: Split authentication into a dedicated Go service (`server/services/auth`) featuring Argon2id password hashing, transparent bcrypt upgrade, TOTP MFA, PKCE OAuth, and ed25519-signed session assertions.
- **Database-per-Service Isolation**: Segmented storage across isolated PostgreSQL databases (`workspace_db`, `auth_db`, `team_db`, `ai_db`, `metrics_db`) with CI-enforced boundary linting.
- **DynamoDB Document Persistence**: Migrated canvas documents (nodes, edges, spatial containment) to DynamoDB with seamless DynamoDB Local support for zero-cost offline development.
- **Responsible Disclosure & Security**: Added root `SECURITY.md` vulnerability reporting policy with private GitHub Security Advisory integration.

### Features & User Experience

- **Jenkos AI Diagramming Agent**: Native Google Gemini integration with automated fallback, tool calling for architecture generation, and AES-256-GCM encryption for user API keys.
- **Canvas UI Redesign**: Complete visual refresh with collapsible toolbars, spatial containment for cloud VPCs, and fluid fluid-clamp responsive layout.
- **Developer Experience**: Automated dev onboarding with `npm run setup` — generates all required ed25519 keypairs, AES/HMAC seeds, and local `.env` configurations automatically.

### Community & Governance

- Added root `LICENSE` (MIT).
- Added `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1).
- Expanded `CONTRIBUTING.md` into a complete guide covering dual-stack development, testing pyramid, and architecture boundaries.
- Added GitHub issue templates (`bug_report.yml`, `feature_request.yml`, `config.yml`) and enhanced `PULL_REQUEST_TEMPLATE.md`.
- Added CodeQL static security analysis workflow.

---

# [1.11.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.10.0...v1.11.0) (2026-07-19)

### Features

- **templates:** replace Data Analytics template with Meshwork Target Stack template ([326ef06](https://github.com/Andiewitz/meshwork-studiov2/commit/326ef06b61545709cc23465337d4a838b8790d80))

# [1.10.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.9.0...v1.10.0) (2026-07-19)

### Features

- **templates:** add Meshwork Target Stack microservice blueprint template ([cb0ba0d](https://github.com/Andiewitz/meshwork-studiov2/commit/cb0ba0d26fd7affd38b9593f974d2769098ee94a))

# [1.9.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.8.0...v1.9.0) (2026-07-12)

### Features

- **aws:** update database, redis, and secrets layout in env templates ([88bc64b](https://github.com/Andiewitz/meshwork-studiov2/commit/88bc64bd092be644c9bd7962a2ebe523df139887))

# [1.8.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.7.0...v1.8.0) (2026-07-12)

### Features

- **aws:** update environment configuration and rewrite deploy workflow for AWS EC2 ([27b4bb4](https://github.com/Andiewitz/meshwork-studiov2/commit/27b4bb46f2260f8dd9879b64d92b99b49f923d86))

# [1.7.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.6.0...v1.7.0) (2026-07-11)

### Features

- **deploy:** add free-tier EC2 + RDS deployment scripts and docs ([288b2c7](https://github.com/Andiewitz/meshwork-studiov2/commit/288b2c790894d5242f2970818b768b01a4a490d2))

# [1.6.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.5.0...v1.6.0) (2026-07-11)

### Features

- **auth:** add jti to access tokens, check denylist on every request, revoke both tokens on logout ([9359555](https://github.com/Andiewitz/meshwork-studiov2/commit/93595553b27e89ab7893d9d942a177a31ada7535))

# [1.5.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.12...v1.5.0) (2026-07-11)

### Features

- move AWS Terraform to project root and add migration plan ([956445a](https://github.com/Andiewitz/meshwork-studiov2/commit/956445a9b2eccc95138291e528615f8af9988d2c))

## [1.4.12](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.11...v1.4.12) (2026-07-11)

### Bug Fixes

- **type-safety:** type registry, routes, captcha and auth strategy ([f750a03](https://github.com/Andiewitz/meshwork-studiov2/commit/f750a03260dc770ae195d7e40e833270f32d0e63))

## [1.4.11](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.10...v1.4.11) (2026-07-08)

### Bug Fixes

- **type-safety:** resolve warnings in ai db.ts and tests ([c95a430](https://github.com/Andiewitz/meshwork-studiov2/commit/c95a430c5894897b609751882460e3583cfeddaf))

## [1.4.10](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.9...v1.4.10) (2026-07-06)

### Bug Fixes

- **lint:** suppress false-positive security warnings ([045d052](https://github.com/Andiewitz/meshwork-studiov2/commit/045d0525cd4f6c4afe95ddf7068a254140ceca0c))

## [1.4.9](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.8...v1.4.9) (2026-07-05)

### Bug Fixes

- **e2e:** expand mock user and bypass auth/me db fetch ([d9ad67d](https://github.com/Andiewitz/meshwork-studiov2/commit/d9ad67d57142ba62c19d5f7f501461851d0f7d00))

## [1.4.8](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.7...v1.4.8) (2026-07-05)

### Bug Fixes

- **e2e:** resolve TypeScript errors in WorkspaceInMemoryStorage ([a023948](https://github.com/Andiewitz/meshwork-studiov2/commit/a0239483390aefe0a2936b1927a02951986231f9))

## [1.4.7](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.6...v1.4.7) (2026-07-05)

### Bug Fixes

- **e2e:** mock workspace storage and bypass csrf token endpoint crash ([94fe471](https://github.com/Andiewitz/meshwork-studiov2/commit/94fe47138c0fb782651e1540c3bf2b37ad926de1))

## [1.4.6](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.5...v1.4.6) (2026-07-05)

### Bug Fixes

- **e2e:** bypass rate limiters in test mode and optimize E2E specs ([8ec1e48](https://github.com/Andiewitz/meshwork-studiov2/commit/8ec1e48435792d0ed75601c09234acdbf69dcacb))

## [1.4.5](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.4...v1.4.5) (2026-07-05)

### Bug Fixes

- **e2e:** rewrite specs to be self-contained and bypass CSRF in E2E mode ([1de2c7f](https://github.com/Andiewitz/meshwork-studiov2/commit/1de2c7ff076317ee36205ad0518b3fe9bf16e816))

## [1.4.4](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.3...v1.4.4) (2026-07-05)

### Bug Fixes

- **e2e:** bypass auth check for playwright runs via E2E_BYPASS_AUTH ([23db900](https://github.com/Andiewitz/meshwork-studiov2/commit/23db9003494e982ff8cf4e916ceff8cd47da37e8))

## [1.4.3](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.2...v1.4.3) (2026-07-05)

### Bug Fixes

- **ci:** add postgres service and env variables to e2e test job ([6700f49](https://github.com/Andiewitz/meshwork-studiov2/commit/6700f494834bfadac05812a26d89a4b3e3b00b48))

## [1.4.2](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.1...v1.4.2) (2026-07-05)

### Bug Fixes

- fix openrouter validation and update register integration tests ([c141a44](https://github.com/Andiewitz/meshwork-studiov2/commit/c141a44c104391ca03bceda48631129e53698739))

## [1.4.1](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.4.0...v1.4.1) (2026-07-05)

### Bug Fixes

- resolve pre-existing TypeScript and ESLint configuration errors ([f4e49af](https://github.com/Andiewitz/meshwork-studiov2/commit/f4e49aff6719ec88f4c3bb0174e3615feb8c8c9d))

# [1.4.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.3.6...v1.4.0) (2026-07-05)

### Features

- **ai:** redesign Mosh AI Provider System with resolver and schema fixes ([38532f9](https://github.com/Andiewitz/meshwork-studiov2/commit/38532f9207c0dcffbf9283bc7755b803f08294df))

## [1.3.6](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.3.5...v1.3.6) (2026-07-05)

### Bug Fixes

- **auth:** fix 403 on register by including credentials in csrf initialization ([c944f44](https://github.com/Andiewitz/meshwork-studiov2/commit/c944f4412e4d5b883e9a3629e6c41d2c52586ab5))

## [1.3.5](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.3.4...v1.3.5) (2026-07-05)

### Bug Fixes

- **ci:** use main branch for trufflehog action ([7936ffe](https://github.com/Andiewitz/meshwork-studiov2/commit/7936ffe9edf1aa54b951352b8282afbe9571635e))

## [1.3.4](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.3.3...v1.3.4) (2026-07-05)

### Bug Fixes

- resolve CI/CD lint and secrets scan failures ([7f89e8c](https://github.com/Andiewitz/meshwork-studiov2/commit/7f89e8c9b3bfba42627998c5d950d038fa8eaeea))

## [1.3.3](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.3.2...v1.3.3) (2026-07-05)

### Bug Fixes

- workspace title property (was .name, should be .title) ([a74580b](https://github.com/Andiewitz/meshwork-studiov2/commit/a74580bbbccbe1dd41123159630fe73dde4465ba))

## [1.3.2](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.3.1...v1.3.2) (2026-07-05)

### Bug Fixes

- auto-login after registration ([4a2086e](https://github.com/Andiewitz/meshwork-studiov2/commit/4a2086ec45c05c4df7cce01f4fdccdc3f1ec8c05))

## [1.3.1](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.3.0...v1.3.1) (2026-07-05)

### Bug Fixes

- permission system rewrite - centralize role hierarchy, fix viewer delete bug ([2650f7e](https://github.com/Andiewitz/meshwork-studiov2/commit/2650f7edc7560892bb0cb64c0f409638590e475a))

# [1.3.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.2.2...v1.3.0) (2026-07-01)

### Features

- add global ErrorBoundary to fix blank screen during navigation ([b3d51cc](https://github.com/Andiewitz/meshwork-studiov2/commit/b3d51cc488ff15086a2f88d9b2a02443677536e7))

## [1.2.2](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.2.1...v1.2.2) (2026-07-01)

### Bug Fixes

- set correct document titles for each page section ([616f464](https://github.com/Andiewitz/meshwork-studiov2/commit/616f464cd5e5d14e19a31e13960a838cfeba659f))

## [1.2.1](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.2.0...v1.2.1) (2026-07-01)

### Bug Fixes

- update OpenRouter model ID to include required vendor prefix ([19a8f23](https://github.com/Andiewitz/meshwork-studiov2/commit/19a8f23d1de3e37ce6df39ecaac19a3b8ded6532))

# [1.2.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.1.1...v1.2.0) (2026-06-30)

### Features

- redesign auth flow from modal to full-page layout ([a69a132](https://github.com/Andiewitz/meshwork-studiov2/commit/a69a1326f57cb73f481474e75bbbcca32a0caf96))

## [1.1.1](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.1.0...v1.1.1) (2026-06-30)

### Bug Fixes

- add Newspaper back to imports (still used in nav bar) ([185d43c](https://github.com/Andiewitz/meshwork-studiov2/commit/185d43cd86c1812b6db423b16f8f7ed0b1e2d138))

# [1.1.0](https://github.com/Andiewitz/meshwork-studiov2/compare/v1.0.0...v1.1.0) (2026-06-30)

### Features

- replace profile hover logout with click dropdown (Settings + Logout) ([3ad78a7](https://github.com/Andiewitz/meshwork-studiov2/commit/3ad78a796376650e1f2acfdc8e434dcafc58cf32))

# 1.0.0 (2026-06-30)

### Bug Fixes

- actually delete grid overlay from Docs ([38c0b0d](https://github.com/Andiewitz/meshwork-studiov2/commit/38c0b0d3b880edc6cfbd5ab4288f66911a77830d))
- add .npmrc to use legacy-peer-deps for Docker build ([26e52c0](https://github.com/Andiewitz/meshwork-studiov2/commit/26e52c0ab1851cbca4bdf957a263eef19cb90b4c))
- add inline Suspense inside DashboardLayout so navbar stays visible during page loads ([ea5235d](https://github.com/Andiewitz/meshwork-studiov2/commit/ea5235de8654cec12bb6f2cce81a5140ec2345a9))
- add safe DB migrations and backup utility to prevent production crashes ([057c9a9](https://github.com/Andiewitz/meshwork-studiov2/commit/057c9a9eb5035cc75e64d14256addc2d8635c6e4))
- add tsx to dockerfile runtime deps for drizzle-kit push ([2d01702](https://github.com/Andiewitz/meshwork-studiov2/commit/2d017022cc570393c1c4e1e8be6eed322708830f))
- adjust cursor coordinates to hit exact center of nodes ([8a176b1](https://github.com/Andiewitz/meshwork-studiov2/commit/8a176b123a81810f7eefcc4656fc1046414128d7))
- adjust search bar alignment and mapping ([92d51b2](https://github.com/Andiewitz/meshwork-studiov2/commit/92d51b200533659d7c669161ad38297564283573))
- **ai:** add credentials:include to chat fetch to send session cookie ([7ea068e](https://github.com/Andiewitz/meshwork-studiov2/commit/7ea068e49ccdeb2c11ecf3d6b4920e687679e2de))
- **ai:** add dotenv to index.ts and implement AI-to-Canvas direct injection ([05c6aa8](https://github.com/Andiewitz/meshwork-studiov2/commit/05c6aa8fc683ba943238d3cf6df72d9fea73eed1))
- **ai:** catch and display undefined choices errors gracefully ([6482c93](https://github.com/Andiewitz/meshwork-studiov2/commit/6482c93b1dc4f731c3ccea024c4be341a386ac1c))
- **ai:** change model to openrouter/free to avoid rate limit 429 errors ([e3b642d](https://github.com/Andiewitz/meshwork-studiov2/commit/e3b642da7da02321b75a464dbc91d4bad4328599))
- **ai:** strip quotes and whitespace from OPENROUTER_API_KEY to prevent 401 errors from Railway ([c1fec3d](https://github.com/Andiewitz/meshwork-studiov2/commit/c1fec3d5ddf58d56380a7103920d60f6e6bfa5c9))
- **ai:** swap gemma-3-27b with gemma-4-31b to resolve upstream rate limits ([2a130ba](https://github.com/Andiewitz/meshwork-studiov2/commit/2a130baa2bedff703c6e9e22a731576151edd2f2))
- **ai:** switch to nvidia/nemotron-3-super-120b-a12b:free (tested, 8s response) ([3202de8](https://github.com/Andiewitz/meshwork-studiov2/commit/3202de87ca162556eb1cab0f7b0bfdf159e4b118))
- **ai:** update openrouter model to meta-llama/llama-3.3-70b-instruct:free ([81f082b](https://github.com/Andiewitz/meshwork-studiov2/commit/81f082baf6b13f6e2fca6540dd060bd2d0aa93d9))
- **ai:** use secureFetch for AI chat to include CSRF tokens ([c5352a2](https://github.com/Andiewitz/meshwork-studiov2/commit/c5352a240385237dea4869d71c118332a7ad0a99))
- allow Google reCAPTCHA in production CSP ([07dc30e](https://github.com/Andiewitz/meshwork-studiov2/commit/07dc30e9c4fc9136834569979cb5120a4996f008))
- allow longer CAPTCHA tokens ([bac3d8d](https://github.com/Andiewitz/meshwork-studiov2/commit/bac3d8d138041909b37a95d6c37e07234abbd7d8))
- attach cursor tracking to ReactFlow onMouseMove instead of wrapper div ([8c708a3](https://github.com/Andiewitz/meshwork-studiov2/commit/8c708a33ce01fb5285a6430b6e1b2a5a63a79ace))
- audit and fix all broken href='#' links across Landing, AuthPage, DashboardLayout ([2b1e344](https://github.com/Andiewitz/meshwork-studiov2/commit/2b1e344b5d4004f90a4f92de440d22375008a3a1))
- **auth, layout:** align fetchUser with session, fix uneven collaborator layout, dynamic chat drawer position, and add OAuth integration tests ([6b8ba06](https://github.com/Andiewitz/meshwork-studiov2/commit/6b8ba06356a8c9a11982a74ec3e899b9ca17c0b2))
- **auth, presence:** fix Google OAuth login config, session sameSite, CSP, and clean up collaborator avatar group ([1081a04](https://github.com/Andiewitz/meshwork-studiov2/commit/1081a041c541f94a6431c1aa9f8fa7e474892a3e))
- bind canvas pointer tracking to global window listener to ensure custom properties successfully traverse react-flow dom hierarchy ([1f2a001](https://github.com/Andiewitz/meshwork-studiov2/commit/1f2a001816e63267ed9d282649a8f0f9946c4388))
- blank screens - add LoadingScreen with animated dots, simplify routing, fix logout redirect ([f5ff004](https://github.com/Andiewitz/meshwork-studiov2/commit/f5ff004e32ede54ce5f04ceeb7227f97f55d280e))
- blank white screen on register/logout - fix Express catch-all route and add Router base path ([7df30eb](https://github.com/Andiewitz/meshwork-studiov2/commit/7df30eb02165a2eb6aa97e60e9171ecee5759567))
- bundle ESM-only packages (connect-redis, ioredis) into CJS output ([7e974f2](https://github.com/Andiewitz/meshwork-studiov2/commit/7e974f2d02b1705b5f4b813dabbf87d2f84fa875))
- **canvas,auth:** Refactor workspace to Upsert algorithm & Resolve strict TS compilation bugs ([d4872b9](https://github.com/Andiewitz/meshwork-studiov2/commit/d4872b96b1260934234079a29f85d5a95b05735b))
- **canvas:** normalize edge animated property to integer for Postgres compatibility ([8ba695e](https://github.com/Andiewitz/meshwork-studiov2/commit/8ba695e6b2ba177eac9d2f12d8c03540f3801030))
- change evening greeting to 5 PM, add Outfit font for headlines, remove duplicate [@import](https://github.com/import) ([9813f43](https://github.com/Andiewitz/meshwork-studiov2/commit/9813f43a06557195bd8f6d19dabed5b4b6f8d23c))
- change Express route pattern from /{*path} to * for Express 4 compatibility ([4c15c23](https://github.com/Andiewitz/meshwork-studiov2/commit/4c15c23292eb0fcc408d715c29dfc0eebbebb427))
- **ci:** scope NODE_ENV=production to build step only - npm ci was skipping devDeps causing exit 127 ([779f6f9](https://github.com/Andiewitz/meshwork-studiov2/commit/779f6f901a57073e4041c728986045abff113e4a))
- complete teams security, bug, UX & perf overhaul (19 fixes) ([6249419](https://github.com/Andiewitz/meshwork-studiov2/commit/624941983c5e4328778c87af1bf3b3aa930e9bb5))
- correct import path for db module in server initialization ([681486a](https://github.com/Andiewitz/meshwork-studiov2/commit/681486ad0cc3131bea336a7007940f3efc12625e))
- correctly center auth modal on the screen ([84eb196](https://github.com/Andiewitz/meshwork-studiov2/commit/84eb196f699518160754e60002fa0a474a8516b1))
- CRITICAL - WS was reading wrong cookie name (meshwork.sid vs connect.sid), all real-time sync was broken ([7ab5b0a](https://github.com/Andiewitz/meshwork-studiov2/commit/7ab5b0ab8bbbabee9308cfac5948bf6dbf9da222))
- cursor overlay now viewport-aware - follows canvas pan/zoom with accurate positioning ([90b84a0](https://github.com/Andiewitz/meshwork-studiov2/commit/90b84a077b6af63127b065e0f5ccc1ed3045241e))
- **db:** add missing style, width, height, and measured columns to canvas nodes and edges schema to persist visual state on save ([e2979c9](https://github.com/Andiewitz/meshwork-studiov2/commit/e2979c9b9dbcbafebc710f50fe4bee1e4685caef))
- **db:** add missing updated_at column to workspaces table and add migration ([d8afeff](https://github.com/Andiewitz/meshwork-studiov2/commit/d8afeff09aca61870e4269f17c41f49939a938fb))
- **db:** add team-related tables to database initialization script ([7e20ad3](https://github.com/Andiewitz/meshwork-studiov2/commit/7e20ad30deadf73b6dbcad65af64838daa96d584))
- **db:** automatically migrate canvas tables to support style and dimension columns on server start ([61cdeec](https://github.com/Andiewitz/meshwork-studiov2/commit/61cdeecc7b36512ce56c2b3281e1651926104348))
- **db:** ensure pgcrypto extension is enabled for UUID generation ([40b2582](https://github.com/Andiewitz/meshwork-studiov2/commit/40b25827571275600446468146d43938e7c7a56e))
- disable Redis when REDIS_URL is empty string ([d5c4d7f](https://github.com/Andiewitz/meshwork-studiov2/commit/d5c4d7f9faedc106840bcda8823521c2ade686b0))
- Dockerfile - restore VITE_RECAPTCHA_SITE_KEY build arg (public key, not secret) ([5aa27bc](https://github.com/Andiewitz/meshwork-studiov2/commit/5aa27bc7f14eac6cd6bd5f900c5954ea4a5e7cf3))
- **docker:** forward OPENROUTER_API_KEY to production backend ([1f48e60](https://github.com/Andiewitz/meshwork-studiov2/commit/1f48e60763b6de3fb81ff3e4f45544df48b0c9f2))
- **docs:** fix syntax error from escaped backticks in template literals ([8b6829a](https://github.com/Andiewitz/meshwork-studiov2/commit/8b6829aff7dd221d4eb1cfb112b2cf306a5c6d0a))
- **docs:** remove padding and adjust height for full bleed layout ([6477b1a](https://github.com/Andiewitz/meshwork-studiov2/commit/6477b1acf0adc37020e75d344e0b60cc109a7c43))
- downgrade connect-redis v9->v7 to fix ioredis ERR syntax error ([bfd30c2](https://github.com/Andiewitz/meshwork-studiov2/commit/bfd30c23efef2cd261dfe01d89bb62221425f2fc))
- explicit --legacy-peer-deps in Dockerfile ([b1c600d](https://github.com/Andiewitz/meshwork-studiov2/commit/b1c600df849c19c111d1db559ae0134bcb3f5bfd))
- Express 4 catch-all route syntax for SPA serving ([9b7cbf6](https://github.com/Andiewitz/meshwork-studiov2/commit/9b7cbf63fb2dc2da7b9e80751d2c7dc2efc3a629))
- extract top panels from ReactFlow to root z-50, remove orphan duplicates, clean JSX ([a6af478](https://github.com/Andiewitz/meshwork-studiov2/commit/a6af4788e57af322a7dc4026070e7e0d2cc8a709))
- fast 500ms WS broadcast for instant peer sync, independent of 3s DB save ([de57153](https://github.com/Andiewitz/meshwork-studiov2/commit/de57153af5e7234d0d472db080af9feb459e17d1))
- faster cursor lerp (0.15 -> 0.4) for snappier drag tracking ([d5fe02b](https://github.com/Andiewitz/meshwork-studiov2/commit/d5fe02b14e24bbdcaa4dc3ebcd042514ce3b8bf2))
- force react-flow node wrappers to have transparent background to prevent color bleed ([063511b](https://github.com/Andiewitz/meshwork-studiov2/commit/063511bb09d23baaeea8f10dbfc80de26b397470))
- grayer search box, Ctrl+K shortcut, functional notifications read state ([99e7b16](https://github.com/Andiewitz/meshwork-studiov2/commit/99e7b162903063e69746af2776b685d38f708692))
- handle edge cases - profile update refresh, clear delete confirmation on cancel ([f3b89eb](https://github.com/Andiewitz/meshwork-studiov2/commit/f3b89eb4706948c176da9835091caaee22666695))
- handle remaining edge cases - inArray for single workspace, hide password for OAuth, add transactions ([c6c54e3](https://github.com/Andiewitz/meshwork-studiov2/commit/c6c54e303aaba77271c837d6decd609dbc1d79bb))
- hardening Railway deployment and adding diagnostic logs ([6b18def](https://github.com/Andiewitz/meshwork-studiov2/commit/6b18def6e935b0d3a660cdced789226221945c6d))
- increase panOnScrollSpeed to fix sluggish mouse scroll ([d0df214](https://github.com/Andiewitz/meshwork-studiov2/commit/d0df214fa5b8c0901d83e033ad39d27255938b2b))
- inject VITE_RECAPTCHA_SITE_KEY into Docker build ([9c63b83](https://github.com/Andiewitz/meshwork-studiov2/commit/9c63b83d85f6e1842a480b2bdc0b4a7a5b62b367))
- lazy-load Redis clients in websocket to prevent startup syntax error ([d894447](https://github.com/Andiewitz/meshwork-studiov2/commit/d89444769fb1104ba8d0e1d7c158bfc63ebac0f6))
- make hero section full viewport height ([2ff4368](https://github.com/Andiewitz/meshwork-studiov2/commit/2ff436895e8bde15cecc0939476973a46988917b))
- make redis optional in healthcheck if REDIS_URL is not set ([9d925a7](https://github.com/Andiewitz/meshwork-studiov2/commit/9d925a790dd4b6c62f8f06357d8a21e734e3490c))
- match admin dashboard to app theme (Plus Jakarta Sans, DM Sans, #FF8000) ([9af4019](https://github.com/Andiewitz/meshwork-studiov2/commit/9af401916b2c360b6bb6db61c77addf723aca114)), closes [#FF8000](https://github.com/Andiewitz/meshwork-studiov2/issues/FF8000) [#0D0D0](https://github.com/Andiewitz/meshwork-studiov2/issues/0D0D0) [#141414](https://github.com/Andiewitz/meshwork-studiov2/issues/141414) [#2E2E2](https://github.com/Andiewitz/meshwork-studiov2/issues/2E2E2) [#FF8000](https://github.com/Andiewitz/meshwork-studiov2/issues/FF8000) [#FF8000](https://github.com/Andiewitz/meshwork-studiov2/issues/FF8000) [#FF8000](https://github.com/Andiewitz/meshwork-studiov2/issues/FF8000) [#FF5500](https://github.com/Andiewitz/meshwork-studiov2/issues/FF5500)
- **mosh:** convert architecture zone to a responsive pseudo-node and use indeterminate progress bar ([012077c](https://github.com/Andiewitz/meshwork-studiov2/commit/012077cfdf29d80978de305c12b196c8778f6bc5))
- move frontendUrl declaration before cspConfig - fixes TS used-before-assigned error ([cdcc6bd](https://github.com/Andiewitz/meshwork-studiov2/commit/cdcc6bd75508f47e8c587a076a21050c97e5dd05))
- move sidebar toggle into toolbar, remove separate collapsed strip ([6353dbe](https://github.com/Andiewitz/meshwork-studiov2/commit/6353dbee30dfe114a83f6b3f7fa58069dc904a39))
- move static serving after route registration to fix API route matching ([bd08fe6](https://github.com/Andiewitz/meshwork-studiov2/commit/bd08fe64fc10d44e67062678f26f5970c8f98dea))
- move top panels back inside ReactFlow to fix floating burger on collapse ([a492a5f](https://github.com/Andiewitz/meshwork-studiov2/commit/a492a5fb001a0be9885871c5081748d1d12ecec3))
- **nested-canvas:** proper UX + smooth transitions ([55256a9](https://github.com/Andiewitz/meshwork-studiov2/commit/55256a9baceb04ac3dbd7ff5623585c7cf7f8648))
- nodeAppear transform was overriding React Flow positioning — opacity only now ([410d1a6](https://github.com/Andiewitz/meshwork-studiov2/commit/410d1a6535400654dfeba0fcc1368fb654a5e0c8))
- normalize template edges boolean for postgres ([fdb466b](https://github.com/Andiewitz/meshwork-studiov2/commit/fdb466b5230e647f28f609fa97759976be19cbdc))
- **notifications:** match app aesthetic — Inter/DM Sans, monochrome hierarchy, readable body text ([6fbf814](https://github.com/Andiewitz/meshwork-studiov2/commit/6fbf8147190d724d4ee07472e247e866e98fdcb7))
- only show onboarding for new users, auto-skip existing accounts and dev mode ([9a1c0a9](https://github.com/Andiewitz/meshwork-studiov2/commit/9a1c0a97aa298031d16d3bf498415c1c47e06392))
- optimize dockerfile by eliminating runtime npm ci step ([2c80e61](https://github.com/Andiewitz/meshwork-studiov2/commit/2c80e61bc304c7218e505fef5ada4fda58ffffdb))
- portal shortcuts modal to document.body to escape transform context, close menu on action clicks ([5066c4c](https://github.com/Andiewitz/meshwork-studiov2/commit/5066c4c16e2e339ad50bdbdd4ab88fe8568cda94))
- **presence:** dynamically shift top-right panel to the left when properties sidebar is open ([c084b61](https://github.com/Andiewitz/meshwork-studiov2/commit/c084b61767b270ef36933bca3a26ae188c5744e9))
- prioritize auth routes over loading check to fix register page ([f83c088](https://github.com/Andiewitz/meshwork-studiov2/commit/f83c088999911a0eb1bfac443db0ff84a2d65793))
- **properties:** color picker now changes actual node color, stripped useless technical config ([80fcc28](https://github.com/Andiewitz/meshwork-studiov2/commit/80fcc28ad27d8440b4372aaf6cdf0e352e4d1c3d))
- refactor layer masking to standard div bounds and use strictly standard css grammar for browser reliability ([3a4d3fb](https://github.com/Andiewitz/meshwork-studiov2/commit/3a4d3fbfdc57c32615d95c1edb872e24b27af5c2))
- register serveStatic after API routes to prevent SPA catch-all swallowing API requests ([96a694d](https://github.com/Andiewitz/meshwork-studiov2/commit/96a694d25732a740f3190ac66607a52a203d0960))
- remove backdrop-blur from SystemNode to fix rasterization/scaling artifacts; issue surgical SQL fix for legacy workspace timestamps ([02decba](https://github.com/Andiewitz/meshwork-studiov2/commit/02decbaec90f57f7770349787518d424d727013f))
- remove connect-pg-simple from Dockerfile since migrating to Redis ([bd3105b](https://github.com/Andiewitz/meshwork-studiov2/commit/bd3105b5176e6081beca5d70dc9f1831b2f5ee1d))
- remove overflow-hidden from main container to restore scrolling and prompt visibility ([cc38203](https://github.com/Andiewitz/meshwork-studiov2/commit/cc3820337f1326a94af3d06a7f23b10c4c864ec8))
- remove transform from node animation to prevent overriding React Flow coordinate positioning ([47b42c5](https://github.com/Andiewitz/meshwork-studiov2/commit/47b42c5e13e0e3e739ed0d3e87e8f134ba9981e1))
- render cursors inside ReactFlow viewport - pixel-perfect accuracy like nodes ([193b3ec](https://github.com/Andiewitz/meshwork-studiov2/commit/193b3ec73a89805dab76ab375561ffd34027ddb5))
- replace canvas-saved refetch with direct canvas-sync via WS - eliminates feedback loop ([422b1ec](https://github.com/Andiewitz/meshwork-studiov2/commit/422b1ecbc7165f265bdcd7f43e4e6f2f70621068))
- replace full-height collapsed sidebar strip with small floating toggle button ([ad405c1](https://github.com/Andiewitz/meshwork-studiov2/commit/ad405c1a53fee8944dcbb34edd3bb8ec278a005d))
- replace shortcuts modal with side-popover dropdown, ? key now opens menu ([7998fda](https://github.com/Andiewitz/meshwork-studiov2/commit/7998fda499b78df692bde898ae9b2b03be37129b))
- resolve canvas save 500 error by aligning DB constraints with Drizzle schema ([a5fb9f8](https://github.com/Andiewitz/meshwork-studiov2/commit/a5fb9f8f0d8f0d0b56abe56c711654b8b21c986f))
- resolve CI/CD build failures by fixing user type mismatches and missing fields ([012330d](https://github.com/Andiewitz/meshwork-studiov2/commit/012330d039201b64734d1230c70023d6365bff2d))
- resolve critical syntax errors in Landing page tags ([a7c6b60](https://github.com/Andiewitz/meshwork-studiov2/commit/a7c6b6018eef82611b0475f2e23da4c7b4eb0182))
- resolve deployment healthcheck errors by optimizing server startup and build command ([4321f3b](https://github.com/Andiewitz/meshwork-studiov2/commit/4321f3b35762351e899ec191bdb5d9e1893a65f5))
- resolve dev blog animations and functionalize share buttons ([bd746d6](https://github.com/Andiewitz/meshwork-studiov2/commit/bd746d6a068959f0505a1be1b61a3a18f5049897))
- resolve ESLint errors across App.tsx, AuthModal, DashboardLayout, and more ([4dd2e15](https://github.com/Andiewitz/meshwork-studiov2/commit/4dd2e155d2dbf236f4eb9b0ffc73bcd91e5c6741))
- resolve icon build errors, fix edge connection jankiness, and unify toolbar ([9187000](https://github.com/Andiewitz/meshwork-studiov2/commit/9187000b5006d0c846ba70e20d7091455e37a4c8))
- resolve npm cache collision during Docker build ([92347df](https://github.com/Andiewitz/meshwork-studiov2/commit/92347dfa872aa08d1131b1a404cab1c5654c1dc4))
- resolve syntax error in CreateWorkspaceDialog (extra div tag) ([d392c98](https://github.com/Andiewitz/meshwork-studiov2/commit/d392c9846dc39703c7ab4ef2841572c7b088a8af))
- resolve TS2322 in SystemNode causing CI typecheck failure ([ba50720](https://github.com/Andiewitz/meshwork-studiov2/commit/ba5072091a4aafab1e93f72b33e034c6cab89b32))
- resolve TypeScript errors for CI pipeline ([8c3615f](https://github.com/Andiewitz/meshwork-studiov2/commit/8c3615f5b41040c6e9a0462515cdacd925855a53))
- resolve TypeScript errors in websocket.ts and integration tests ([df82a52](https://github.com/Andiewitz/meshwork-studiov2/commit/df82a529a1ca6e2c89b126145ac2a5b216f4e143))
- restore grid overlay to Docs page ([bd1989c](https://github.com/Andiewitz/meshwork-studiov2/commit/bd1989c1936dec22832963c422ae5f490059c6bd))
- revert node gradients to solid backgrounds ([1aa3864](https://github.com/Andiewitz/meshwork-studiov2/commit/1aa386453f1beb1952666b080ada1d965ca22ccd))
- revert start script and add safe db migration logic ([30257f5](https://github.com/Andiewitz/meshwork-studiov2/commit/30257f5e44bb187960ce34646fc355a0f0088766))
- rewrite admin dashboard with proper layout and fixed-size charts ([e39e173](https://github.com/Andiewitz/meshwork-studiov2/commit/e39e1733a8faf49bd787f215a7c46e46fec65cdf))
- routing issues - add landing route, use client-side navigation, input validation, show password toggles ([dcb9549](https://github.com/Andiewitz/meshwork-studiov2/commit/dcb9549b1d286df925e22598d560c97226030c75))
- run db:push at container startup where DATABASE_URL is available ([685df3c](https://github.com/Andiewitz/meshwork-studiov2/commit/685df3c29b846fba6efc1b2305b79e058a175870))
- **seo:** simplify brand name to Meshwork Studio everywhere ([3d0d0e0](https://github.com/Andiewitz/meshwork-studiov2/commit/3d0d0e0a414f537c1faa9cddc64f449c5788b444))
- serve static files before module init so frontend loads even on CRITICAL FAILURE ([91fbe57](https://github.com/Andiewitz/meshwork-studiov2/commit/91fbe5736acd9484242bd605b888b37019e206a4))
- server boot resiliency ([387f7d6](https://github.com/Andiewitz/meshwork-studiov2/commit/387f7d6677c953ca90e053244405413474a47c2b))
- set fixed dimensions for text nodes to prevent infinite React Flow scaling loop ([a6411b3](https://github.com/Andiewitz/meshwork-studiov2/commit/a6411b320e40b774efe6499ec1ff9eba59eae8aa))
- sidebars now overlay canvas (absolute) so backdrop-blur actually works ([2264be1](https://github.com/Andiewitz/meshwork-studiov2/commit/2264be1d9468f8ec1b250f6c062b274b8b738355))
- simplify auth routes to fix register page blank screen ([211daf2](https://github.com/Andiewitz/meshwork-studiov2/commit/211daf2d24908682156ca210d963fa5d953e6cf4))
- strip hardcoded background from Docs to inherit layout gradient ([86a04d5](https://github.com/Andiewitz/meshwork-studiov2/commit/86a04d5fce3c89ae355c6e9fa063db1cbcc150c9))
- switch curved lines to true Bezier paths ([bbeb6e3](https://github.com/Andiewitz/meshwork-studiov2/commit/bbeb6e38d03a74d1ce8357571bff055a47858a4d))
- **teams:** resolve TypeScript compilation errors in routes and websocket ([4c29780](https://github.com/Andiewitz/meshwork-studiov2/commit/4c2978050eabf1984a0e3d5be15dc5d2cd7804a0))
- toolbar pill slides with sidebar instead of snapping ([87dee05](https://github.com/Andiewitz/meshwork-studiov2/commit/87dee05edb099a699906de59eeb4b5ff3d039b03))
- **ui:** change forge cta button to primary blue and restore depth to fire gradients ([c604d2e](https://github.com/Andiewitz/meshwork-studiov2/commit/c604d2ee1fc319937a211c9e8717a440318cede7))
- **ui:** eradicate bloody red-orange hues from fiery background layers in favor of true amber and orange ([3d4d3a3](https://github.com/Andiewitz/meshwork-studiov2/commit/3d4d3a3d72e2556254681eb9fcda1f4ad116657e))
- **ui:** normalize atmospheric gradients and forge fire to strictly use Meshwork primary orange hex ([c635489](https://github.com/Andiewitz/meshwork-studiov2/commit/c63548959bfc8db5fba33f9a27ab0a9b760c418c))
- **ui:** revert logo text to blocky font for distinct layout difference ([f245d40](https://github.com/Andiewitz/meshwork-studiov2/commit/f245d402c9adbc7ba1ae66c739596b084ad55fea))
- update duplicate email test to match anti-enumeration message ([8bd0944](https://github.com/Andiewitz/meshwork-studiov2/commit/8bd09444512625b9d1d23b333581108562ff5f6b))
- update test assertions for automatic updatedAt timestamps ([6002af2](https://github.com/Andiewitz/meshwork-studiov2/commit/6002af2a1fbab7c38749890c3639fe70b663508b))
- update test mocks for refreshLimiter and standardized error response shape ([8a62f53](https://github.com/Andiewitz/meshwork-studiov2/commit/8a62f53c272e62155eface4fb7e5bd941545882f))
- use local asset for Team page illustration instead of broken CDN ([7f6bc35](https://github.com/Andiewitz/meshwork-studiov2/commit/7f6bc3506fed3c4e692194a587da9fb61da43326))
- use ViewportPortal for cursors - renders in exact same DOM layer as nodes ([cc32b2e](https://github.com/Andiewitz/meshwork-studiov2/commit/cc32b2ea119c311d097ef0968228b920438f89bc))
- **vpc:** clean up infrastructure container node rendering ([c44408d](https://github.com/Andiewitz/meshwork-studiov2/commit/c44408dc735c1c8a74cf7ff3dd16dcbbd2157437))
- **workspace:** restrict grab cursor and node dragging to correct tool modes ([38fa25a](https://github.com/Andiewitz/meshwork-studiov2/commit/38fa25ad714ddf68ba316e305ddbe7d398d2008e))
- **workspace:** restrict node dragging to Grab/Pan tool and disable it for Select tool ([bb165da](https://github.com/Andiewitz/meshwork-studiov2/commit/bb165dace7b53eaa371974d2c2f23368170efe0f))
- wrap sidebar states in AnimatePresence for proper slide in/out exit animations ([e36a0b9](https://github.com/Andiewitz/meshwork-studiov2/commit/e36a0b928d7cdc7a2921ce17ffd4a849a22f7835))

### Features

- add 'Templates ready to Remix' section inspired by Google AI Studio ([6153cdd](https://github.com/Andiewitz/meshwork-studiov2/commit/6153cdd7e67b50c9d7ed05479017a263530e5946))
- add /api/v1/ versioned route prefix ([2029e8b](https://github.com/Andiewitz/meshwork-studiov2/commit/2029e8b0089cf02fe0a427b33d8ffd6bdaa05da3))
- add 3-step onboarding modal on first dashboard visit ([bb84f47](https://github.com/Andiewitz/meshwork-studiov2/commit/bb84f478d73f8d11bb569bab21fa41a84c06cb42))
- add 3-workspace free tier limit with branded gate in create dialog ([2ec204c](https://github.com/Andiewitz/meshwork-studiov2/commit/2ec204c75f614a699eacf37bede16ff54bf1b8a9))
- add animated pill-style New Workspace button using @base-ui/react ([a18e901](https://github.com/Andiewitz/meshwork-studiov2/commit/a18e9010cbb3011626fd01fcea83bb998f6b2afe))
- add Blog link to dashboard sidebar navigation ([80f2883](https://github.com/Andiewitz/meshwork-studiov2/commit/80f28834f7d4f026e1866367c90c71b753c7e108))
- add blue-green deployment documentation and implement SystemNode component with brand-specific styling ([210f87f](https://github.com/Andiewitz/meshwork-studiov2/commit/210f87feb35bc1268c71cbd40805077cd86216ec))
- add built-in admin metrics dashboard at /admin ([2430b14](https://github.com/Andiewitz/meshwork-studiov2/commit/2430b1422f1e06fee08b3e9f24ea51e3a928106d))
- add case studies section and redesign footer with AI Studio-style layout and giant wordmark ([50a97f9](https://github.com/Andiewitz/meshwork-studiov2/commit/50a97f94200061e490e9fea405d1d6cdfd2a68e3))
- add comprehensive settings page with profile, password, delete account, delete data features ([1684f36](https://github.com/Andiewitz/meshwork-studiov2/commit/1684f3660cb6580bc3d0acc1cc1f9a478a721cb0))
- add dedicated Pan Tool (Hand); fix grabbing cursor leaking into Select mode ([2c59abe](https://github.com/Andiewitz/meshwork-studiov2/commit/2c59abe3199e13b38de6ff7be880cdbee26cce3c))
- add dynamic time-based greeting with user name on dashboard ([6bfa95d](https://github.com/Andiewitz/meshwork-studiov2/commit/6bfa95d2f6c34fed3824a31a41c28b3b6ba2e128))
- add entrance animation to canvas and restore standard mouse panning sensitivity ([94fa188](https://github.com/Andiewitz/meshwork-studiov2/commit/94fa1888572fb040e8a84333179dcc4a3c0baefb))
- add floating component library panel with search, collapsible categories, and drag-to-canvas ([e284213](https://github.com/Andiewitz/meshwork-studiov2/commit/e2842138495b9f439f5c679e24ec9aed19d9781c))
- add generated carousel images ([211c43c](https://github.com/Andiewitz/meshwork-studiov2/commit/211c43c3415026023d51fcc636beb9ca7323c35a))
- add generic zod request validation middleware ([a825220](https://github.com/Andiewitz/meshwork-studiov2/commit/a825220970f11907f7bd2601d6c42a11febad5db))
- add lenis smooth scrolling to landing page ([e716161](https://github.com/Andiewitz/meshwork-studiov2/commit/e716161d9b82bb65aa40a11ecc25eb8aeee6f595))
- add login/signup unit and integration tests + fix CL auth package ([899121e](https://github.com/Andiewitz/meshwork-studiov2/commit/899121eaa3fa551a95544aadc03c7d326dc9b9d9))
- add M logo to collapsed sidebar with transition to full text ([f414b4c](https://github.com/Andiewitz/meshwork-studiov2/commit/f414b4c39952c518fcab05909790eda132b660d0))
- add mobile viewport gate on all protected routes with branded MobileGate component ([f0b13db](https://github.com/Andiewitz/meshwork-studiov2/commit/f0b13db24e15a345ae50c16d35288cb03af65f5d))
- add orange wavy background, input validation with green highlights, show password toggle to login ([f655ac5](https://github.com/Andiewitz/meshwork-studiov2/commit/f655ac563725437bae272e6e0f36d2de5580dcec))
- add precise logging to login and register routes ([826de5c](https://github.com/Andiewitz/meshwork-studiov2/commit/826de5c36df4f200edbf121f9a7150b6edca2115))
- add prometheus metrics endpoint and collectors ([ff1d6e6](https://github.com/Andiewitz/meshwork-studiov2/commit/ff1d6e670ce1132dc655f0e665962e499aff56b8))
- add real architecture templates with auto-creation workflow and unit tests ([d78a4ff](https://github.com/Andiewitz/meshwork-studiov2/commit/d78a4ffe4edb3ce1cf7cea75f0592fa3002f07c7))
- add Redis infrastructure and client utility ([a7978d0](https://github.com/Andiewitz/meshwork-studiov2/commit/a7978d050f709b7b777d3b943f578e111f3871a2))
- add Terms of Service and Privacy Policy pages ([7fb0cfe](https://github.com/Andiewitz/meshwork-studiov2/commit/7fb0cfe5888bb3d0e5b6029fa1e71e7aa8ab5e9e))
- add updated_at to workspaces; fix home recents sorting and last edited timestamp ([a8c6587](https://github.com/Andiewitz/meshwork-studiov2/commit/a8c6587982cf17e31a31d79e25eab198dc82d320))
- **ai:** add dynamic, context-aware suggestions for Mosh and fix backend API key retrieval bug ([cca3a87](https://github.com/Andiewitz/meshwork-studiov2/commit/cca3a8728d7c6310e4135b0c9d73f3604c2a9f7e))
- **ai:** complete premium UI rewrite - silent JSON, proper canvas replace, animations ([a5c0785](https://github.com/Andiewitz/meshwork-studiov2/commit/a5c0785598e2b1aafbe4f1e54391a63779bc1303))
- **ai:** implement exponential backoff retries for Mosh requests to handle rate limits and transient errors ([8ae5cd7](https://github.com/Andiewitz/meshwork-studiov2/commit/8ae5cd7d8233f94e71b432466bce68bd358781f8))
- **ai:** inject current canvas state into AI context ([dfaba16](https://github.com/Andiewitz/meshwork-studiov2/commit/dfaba16c8f0ace170ba70a3d7b8641d9ae5ca410))
- **ai:** inject meshwork architecture schema into ai chat drawer prompt ([064b782](https://github.com/Andiewitz/meshwork-studiov2/commit/064b7822b0a2c318a3346bd8ff69bf3de6116740))
- **ai:** integrate AI chat drawer in workspace with OpenRouter free tier ([7743a49](https://github.com/Andiewitz/meshwork-studiov2/commit/7743a49452678d1f3f39f05e402d9068953e6f26))
- **ai:** NVIDIA Nemotron, ground-truth prompt, annotations, arrows, viewport, validator ([d6d77a3](https://github.com/Andiewitz/meshwork-studiov2/commit/d6d77a371ae5cfdff167e94a4ebf653bf843bfd1))
- **ai:** switch default model to DeepSeek R1 and remove unused 'kyle carnes' folder ([e9158d1](https://github.com/Andiewitz/meshwork-studiov2/commit/e9158d100310d1038ead7e827eeeac766e904605))
- **auth:** enhance error UX with specific inline field validation ([dc1d0ec](https://github.com/Andiewitz/meshwork-studiov2/commit/dc1d0ec81ede462fcb08b3dda57b1aeef30d2ad2))
- **auth:** redesign login and register pages to 50/50 split layout ([9e71dce](https://github.com/Andiewitz/meshwork-studiov2/commit/9e71dce7b46cfc969781339e697c78ec0c77af51))
- **blog:** add Canvas Node & Workspace Schema dev blog post with schema SVG illustration ([459db8d](https://github.com/Andiewitz/meshwork-studiov2/commit/459db8dc9943832a6ab29bcb2d7e68e948932bea))
- canvas redesign - full-bleed dark canvas with vertical right-side toolbar (Stitch-style) ([6a296d6](https://github.com/Andiewitz/meshwork-studiov2/commit/6a296d6cfe2344d9ad94bf2fba0ff77267bd3bdb))
- center hero and remove carousel on landing page ([e8f6623](https://github.com/Andiewitz/meshwork-studiov2/commit/e8f66231a793ae04c945a1480bcbeef5a16fc18d))
- complete decoupling and canvas sync fixes ([be95eed](https://github.com/Andiewitz/meshwork-studiov2/commit/be95eed8640f52b3bcb4d5cead3a8599687fa481))
- Dashboard UI Redesign complete overhaul ([69add7b](https://github.com/Andiewitz/meshwork-studiov2/commit/69add7b393d1f82dc2a3709989cb701c4e752d7a))
- destroy card layouts for sticky narrative and neon glassmorphism ([60a6243](https://github.com/Andiewitz/meshwork-studiov2/commit/60a6243a6f1d12441a48fae579ffefd62fd8e6d4))
- **docs:** redesign dev page to anthropic-style docs layout ([f53c132](https://github.com/Andiewitz/meshwork-studiov2/commit/f53c132b6ded077d1e0e1ed1f3a0f90dc56e5ee4))
- enable marquee multi-selection for the default cursor mode ([d2fa49d](https://github.com/Andiewitz/meshwork-studiov2/commit/d2fa49d5f4487a55c16d85b46d671382a088b304))
- enhance glassmorphism styling, add panOnScroll to canvas, lower right toolbar position ([60faf15](https://github.com/Andiewitz/meshwork-studiov2/commit/60faf156a7ef9e9be32ddebbae4c26c650384175))
- full canvas live sync - add/delete/edit nodes sync across users without refresh ([8b2559c](https://github.com/Andiewitz/meshwork-studiov2/commit/8b2559c1197cb9ad55338691a7f89cf9586780bd))
- full member list with role editing - click role badge to change, shows all members with online status ([700dd7a](https://github.com/Andiewitz/meshwork-studiov2/commit/700dd7aa507286bba1bca3e7d939a7decc05eace))
- immersive hero redesign, global minimalist logo, and dynamic favicon ([003c9cd](https://github.com/Andiewitz/meshwork-studiov2/commit/003c9cd5f4bd2bf7ad34e9f5127dfe5e1695c7e8))
- implement CAPTCHA verification service and integrate into registration flow ([d2d7dfc](https://github.com/Andiewitz/meshwork-studiov2/commit/d2d7dfc6fcf7220a173af12641b949cdd1451fe3))
- implement dependency-aware health check endpoint ([e048223](https://github.com/Andiewitz/meshwork-studiov2/commit/e048223964b146356a68a7b41205baeeb7a84527))
- implement dynamic radial mouse-tracking glow over canvas dots ([0e7136a](https://github.com/Andiewitz/meshwork-studiov2/commit/0e7136a8aa96a45e73e5c769547becf8375c419d))
- implement onSelectionContextMenu with robust multi-node action support ([05a0c79](https://github.com/Andiewitz/meshwork-studiov2/commit/05a0c79cd594bc85bd6d6e47e801e1da683e6a28))
- implement password security policy, hashing utilities, and user management settings page ([c9e7f43](https://github.com/Andiewitz/meshwork-studiov2/commit/c9e7f43521570751a9d7ac14113d95c446e6e037))
- implement public landing page and fix CSP duplicate directive crash ([5de219a](https://github.com/Andiewitz/meshwork-studiov2/commit/5de219a8ee4c5e36623b405337505c4b5fb0a48d))
- implement robust canvas saving with local caching and debounced auto-save ([2dea805](https://github.com/Andiewitz/meshwork-studiov2/commit/2dea805e17e9f1e41b9775f1e55076d1f7e5a432))
- implement SystemNode component with dynamic branding and Kubernetes support for canvas visualization ([269ca87](https://github.com/Andiewitz/meshwork-studiov2/commit/269ca873bd2065a2438f05d8cde86a460ac833e8))
- implement workspace canvas editor with node management, undo/redo, and infrastructure simulation capabilities ([15db3e0](https://github.com/Andiewitz/meshwork-studiov2/commit/15db3e0515f65a83db8aa8876bdeb115e1070bc8))
- implement workspace duplication and comprehensive deletion suite ([ec7556b](https://github.com/Andiewitz/meshwork-studiov2/commit/ec7556b2af0b076e61c97faa51481e04d9d4bfa0))
- implement workspace node property sidebar and add infrastructure configuration utilities ([eac6537](https://github.com/Andiewitz/meshwork-studiov2/commit/eac6537803ec218de281489823cd452a288a1e8f))
- integrate smooth scroll and redesign create workspace dialog ([63a0fb8](https://github.com/Andiewitz/meshwork-studiov2/commit/63a0fb8ba94fef93d9ceb8ab3b6bfe3a401440f9))
- jwt access and refresh tokens ([41c143d](https://github.com/Andiewitz/meshwork-studiov2/commit/41c143d79942cd2e974fbedfe921e6032273829f))
- live team sync - 5s auto-polling on all team queries ([7088b6c](https://github.com/Andiewitz/meshwork-studiov2/commit/7088b6c3d450ae4c269ac43c5e851224c1657e7c))
- major canvas overhaul — dark acrylic nodes, spring context menus, grid fade-in, MiniMap to bottom-right, selection box styling ([95bda6d](https://github.com/Andiewitz/meshwork-studiov2/commit/95bda6d80f7ee4dac0446be0a2e6233feeba8217))
- migrate server to Pino structured logging ([770c9e5](https://github.com/Andiewitz/meshwork-studiov2/commit/770c9e52e5c4cefb590ca79c327a6fc79fbb25f7))
- migrate session store to Redis via connect-redis ([c68fb6c](https://github.com/Andiewitz/meshwork-studiov2/commit/c68fb6cd0f484f5791316fa16ba956134d30c734))
- **mosh:** add sophisticated generation overlay and cycling progress indicator ([7a86f36](https://github.com/Andiewitz/meshwork-studiov2/commit/7a86f36cff73f4a25dc4fa845bba505ae36d9eb5))
- nested canvas workspaces + dynamic favorites + node reorganization ([3fafdd2](https://github.com/Andiewitz/meshwork-studiov2/commit/3fafdd2b19442332cb32c2816a95babd3b781d9b))
- **notifications:** slide-in sidebar panel with backdrop blur ([0cee8d2](https://github.com/Andiewitz/meshwork-studiov2/commit/0cee8d2ea9541c257e9746626a16aa3c94c00a85))
- overhaul landing page with aggressive animations and fixed entrance triggers ([780220e](https://github.com/Andiewitz/meshwork-studiov2/commit/780220e40e7c7ed47646e074223deb7560ad8d36))
- persist notification read states and team notification flag in localStorage ([8e047d6](https://github.com/Andiewitz/meshwork-studiov2/commit/8e047d6c17b5e81561c633fd25a20b7b7205faa5))
- Phase 1 - export canvas as PNG/SVG/JSON + import JSON with validation (24 new tests, 195 total) ([e30d7fc](https://github.com/Andiewitz/meshwork-studiov2/commit/e30d7fcacadcad8462c47548c5f0159cda64a8ad))
- Phase 2 - rename project (inline edit), duplicate, share invite code ([8fc269a](https://github.com/Andiewitz/meshwork-studiov2/commit/8fc269a705bfd2b78f9f6ca653e1c0567cd0cdf8))
- Phase 3 - keyboard shortcuts modal (? key) + fullscreen toggle (F11) with 15 new tests, 210 total ([c8d6a43](https://github.com/Andiewitz/meshwork-studiov2/commit/c8d6a43acb93ad9081b8f3186a5b624568c88902))
- Phase 4 - canvas settings sub-menu (grid, edges, background) with 25 new tests, 235 total ([9dad291](https://github.com/Andiewitz/meshwork-studiov2/commit/9dad29163981315ac127fd71abc38702b48604bc))
- polish dashboard with yellow favorites, smart sorting, and isolated search hovers ([98f73b7](https://github.com/Andiewitz/meshwork-studiov2/commit/98f73b742540252a2e0c364671b5b15be2be2918))
- protect admin dashboard with secret URL path ([ff4f448](https://github.com/Andiewitz/meshwork-studiov2/commit/ff4f448de38cd8269717cae2f9d35aa1a762aa95))
- real-time node position sync across collaborators via WebSocket ([9b51e7a](https://github.com/Andiewitz/meshwork-studiov2/commit/9b51e7a8e97e5d7570791c27e6a0d03bbf5a0e6d))
- redesign Docs page with Sharp Glassmorphism and real content ([28516e2](https://github.com/Andiewitz/meshwork-studiov2/commit/28516e2ef08a1d9b5ad0ab0db74535b8d2299518))
- redesign landing page with 3D carousel and standardize typography to Inter ([3ce1131](https://github.com/Andiewitz/meshwork-studiov2/commit/3ce1131f1bfcb8279dba1e9188e5403197887027))
- redesign workspace cards and create dialog, add persistent favorites with unit tests ([a2cb6a2](https://github.com/Andiewitz/meshwork-studiov2/commit/a2cb6a2aa0438f8ba24712e55c6efaff2095744b))
- redis-backed jwt token revocation ([3ad71d7](https://github.com/Andiewitz/meshwork-studiov2/commit/3ad71d704bcf341ca2002bee56feeed6079c8f79))
- refactor Docs page into technical blog post format ([a23bc9e](https://github.com/Andiewitz/meshwork-studiov2/commit/a23bc9ed7a1ecfaeedda51717831ad6f9f80ed5b))
- refine dashboard and workspace library logic; fix white screen ([5f610fe](https://github.com/Andiewitz/meshwork-studiov2/commit/5f610feb86cca0ab1b6774d29d08ac946e7f56ca))
- refined save functionality ([19802ff](https://github.com/Andiewitz/meshwork-studiov2/commit/19802ff2b79e37a48da0709196fb32068e966b7c))
- remove header bar, floating glassmorphic UI panels, toolbar moved lower ([d6d934c](https://github.com/Andiewitz/meshwork-studiov2/commit/d6d934cea1c170606f94855c9ee5ca0f2a20e48d))
- replace dedicated auth pages with premium modal popup ([f6cab34](https://github.com/Andiewitz/meshwork-studiov2/commit/f6cab34a6e5bd903381daddd18dcee33b63ff192))
- replace Replit favicon with custom M icon SVG ([c8ae21a](https://github.com/Andiewitz/meshwork-studiov2/commit/c8ae21ad89a46f688704a2b3aab1a566d4f3ec7c))
- replace welcome modal with proper profile setup onboarding flow (name, role, referral, use case) ([4941298](https://github.com/Andiewitz/meshwork-studiov2/commit/494129884abe7e876302bba39208d739e99343a9))
- restructure Settings page layout to use sidebar navigation ([da7de82](https://github.com/Andiewitz/meshwork-studiov2/commit/da7de82f9af1874030288b8a0af671bc87ebeb65))
- role-based access control - owner/admin/editor/viewer with member management dropdown, glassmorphism toolbar, viewer restrictions ([e06c897](https://github.com/Andiewitz/meshwork-studiov2/commit/e06c8977353473beef409f380825c32b9c3b9374))
- schema flexibility upgrades for nodes, edges, and workspaces ([2db4b62](https://github.com/Andiewitz/meshwork-studiov2/commit/2db4b6224dbd60b66d2de36b84ea2f720ccc209f))
- **security:** Implement global and auth-specific rate limiting ([7545a00](https://github.com/Andiewitz/meshwork-studiov2/commit/7545a00593fbf94a620b33ee76dac4abaa99928c))
- stabilize multiplayer teams architecture and premium UI overhaul ([18e1745](https://github.com/Andiewitz/meshwork-studiov2/commit/18e1745de028c70109584c65d82652478c4e438d))
- **teams:** Phase 1 -- add teams, team_members, team_workspaces schema with cursor colors ([de627ea](https://github.com/Andiewitz/meshwork-studiov2/commit/de627ea71ceb489d2f655f305e2293105d6aed1b))
- **teams:** Phase 2 -- add TeamModule with storage, routes, and invite code system ([3624665](https://github.com/Andiewitz/meshwork-studiov2/commit/3624665170caf5429773b876461a412cb3dc3a33))
- **teams:** Phase 3 -- add WebSocket presence server for real-time cursor broadcasting ([7c36d80](https://github.com/Andiewitz/meshwork-studiov2/commit/7c36d80ca90b81af5fcbe836191f6f8d6e8a8d28))
- **teams:** Phase 4 -- complete client UI with Team dashboard, cursor overlays, and presence hooks ([affcffb](https://github.com/Andiewitz/meshwork-studiov2/commit/affcffb1ddacb785f171909477d0436e3c1fbe01))
- toolbar rework + animate-ui AvatarGroup ([4b90de9](https://github.com/Andiewitz/meshwork-studiov2/commit/4b90de992640755546fbfb09a5d400a3bf44f9c3))
- track user metrics (signups, active users, logins, workspaces, teams) ([3517ce2](https://github.com/Andiewitz/meshwork-studiov2/commit/3517ce2c903cd51d4cf8dd8915632d3a63c8c100))
- **ui:** add hover tooltips to canvas nodes to show descriptions ([e3555f3](https://github.com/Andiewitz/meshwork-studiov2/commit/e3555f3b00dfae27e53a798ea51329f4a5ae76eb))
- **ui:** add hover tooltips with descriptions to node library sidebar components ([f827ad0](https://github.com/Andiewitz/meshwork-studiov2/commit/f827ad022e800b3c08198a488f5ba4b8fe5b1a55))
- **ui:** allow multi-line node labels on canvas and sidebar ([58f5084](https://github.com/Andiewitz/meshwork-studiov2/commit/58f50845e0c8a3e936cbfb72d5265f6d2f97c81d))
- **ui:** auto-resize ai chat textarea based on content ([8a0e169](https://github.com/Andiewitz/meshwork-studiov2/commit/8a0e1690a473ec70470fc4dff498d8bd22913586))
- **ui:** complete prometheus redesign mapping to devops architecture and custom canvas preview ([fdc6ff3](https://github.com/Andiewitz/meshwork-studiov2/commit/fdc6ff3f8195087c4e4e2d5ff39742cd0185bb72))
- **ui:** display custom node properties description in canvas tooltip ([e181e58](https://github.com/Andiewitz/meshwork-studiov2/commit/e181e583beac9a397fcb3866d46088b94ccf3848))
- **ui:** massive brutalist overhaul of landing page sections below hero ([c37605c](https://github.com/Andiewitz/meshwork-studiov2/commit/c37605c004237fb51ff71a6d6ddd194f76cdfe76))
- **ui:** port prometheus landing page design and adapt to primary typescript stack with smooth scroll ([ff420f8](https://github.com/Andiewitz/meshwork-studiov2/commit/ff420f86facf349375da6f9fa4f2a10c865c625d))
- **ui:** redesign AI Chat Drawer with glassmorphism and markdown support ([88d8d71](https://github.com/Andiewitz/meshwork-studiov2/commit/88d8d712254ca25e4e39d11190b0c64ca8bba9fc))
- **ui:** replace full-page spinner in home with skeleton cards for smoother loading ([0c0b61d](https://github.com/Andiewitz/meshwork-studiov2/commit/0c0b61d12c11be630627415b5547ba4b4946a02a))
- **ui:** use continuous global spinner instead of skeletons for workspace loading ([00bfd6a](https://github.com/Andiewitz/meshwork-studiov2/commit/00bfd6aa5c6c8e5fb16f893df58f8ecd9c5f3bbe))
- unique variants, MotionConfig override, and scroll heartbeat ([19ac8b4](https://github.com/Andiewitz/meshwork-studiov2/commit/19ac8b44e5f2189d46d7e30a18c69fea2aaadb13))
- update logo across sidebar, login, and register to use mesh SVG icon ([98646fd](https://github.com/Andiewitz/meshwork-studiov2/commit/98646fd0c877737810f201dd90d36ed27c171d84))
- upgrade notification persistence to cloud-synced backend storage ([d3fd3c1](https://github.com/Andiewitz/meshwork-studiov2/commit/d3fd3c121693620a7804e1c7c781c06630070411))
- upgrade templates with complex scaled architectures and nesting ([7abd75a](https://github.com/Andiewitz/meshwork-studiov2/commit/7abd75a6fcaf116b145dabe8995000c17f7e31de))
- websocket horizontal scaling via redis pub/sub ([87facb4](https://github.com/Andiewitz/meshwork-studiov2/commit/87facb47031ceff4f6652d4b47ab8ba3f2ae7657))
- **workspace:** implement custom ctrl + +/- zoom and ctrl + 0 fit view shortcuts ([e4d8b66](https://github.com/Andiewitz/meshwork-studiov2/commit/e4d8b66893776ca3ea6b4219b2c1c14bdc64298b))
- **workspace:** make workspace title optional and default to 'Untitled' ([c83d3f2](https://github.com/Andiewitz/meshwork-studiov2/commit/c83d3f29e6c55db4c4e51f39e38f85141d6d775a))
- **workspace:** redesign context menus and add slide-in properties panel ([b8528b5](https://github.com/Andiewitz/meshwork-studiov2/commit/b8528b553da09692cba8103708c12089d6983999))
- **workspace:** redesign node library as permanent left sidebar with quick-add favorites, simplified categories, and cleaner labels ([cdb198a](https://github.com/Andiewitz/meshwork-studiov2/commit/cdb198a70682057380b0c0e378b3be58bf2c7f51))

### Performance Improvements

- add route-level code splitting, trim Google Fonts from 25+ to 3 families, add Vite chunk splitting for vendor libs ([49f230d](https://github.com/Andiewitz/meshwork-studiov2/commit/49f230ddce164257491e382dd6bf22fd33b276f0))
- optimize carousel images to webp and add lazy loading ([22866bc](https://github.com/Andiewitz/meshwork-studiov2/commit/22866bc0a2ea94c59be78000ce209cc658d47299))
- **routing:** eager preload lazy route chunks to eliminate sequential loading spinners ([781c54d](https://github.com/Andiewitz/meshwork-studiov2/commit/781c54d3b6b0cb4875f2d76779ecbadc6acd8efd))

### Reverts

- restore original collapsed sidebar strip and toolbar margin ([8ff58b8](https://github.com/Andiewitz/meshwork-studiov2/commit/8ff58b8d7595b2bfb5ef2d538dc80274d7b5a5d2))
