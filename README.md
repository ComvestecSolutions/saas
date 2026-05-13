# Comvestec SaaS Foundation

Governed, backend-first SaaS infrastructure for Comvestec Solutions.

Reusable contracts, runtime services, platform adapters, and operator workflows for the public web, product app, and admin app.

![Bun 1.3.11](https://img.shields.io/badge/Bun-1.3.11-fbf0df?logo=bun&logoColor=000000)
![TypeScript 6](https://img.shields.io/badge/TypeScript-6-1f6feb?logo=typescript&logoColor=white)
![Effect runtime backbone](https://img.shields.io/badge/Effect-runtime%20backbone-111827)
![Convex reactive state](https://img.shields.io/badge/Convex-reactive%20state-f59e0b)
![PostgreSQL governance state](https://img.shields.io/badge/PostgreSQL-governance%20state-336791?logo=postgresql&logoColor=white)
![Ory Keto authorization boundary](https://img.shields.io/badge/Ory%20Keto-authorization%20boundary-0f766e)
![Trivy security hygiene](https://img.shields.io/badge/Trivy-security%20hygiene-1904da)

> [!IMPORTANT]
> This repository is the product-line base for Comvestec Solutions, not a one-off app starter. Every change is expected to strengthen shared contracts, shared governance, and shared operator workflows.

## Architecture Snapshot

```mermaid
flowchart LR
  PublicWeb[Public Web]
  ProductApp[Product App]
  AdminApp[Admin App]

  subgraph Workspace[Shared Workspace]
    Contracts[Contracts]
    Config[Config Manifests and Defaults]
    Modules[Modules]
    PlatformServices[Platform Services, Snapshots, and HTTP APIs]
    PlatformAdapters[Platform Adapters]
    Specs[Specs and ADRs]
    Tests[Tests and Validators]
  end

  subgraph Runtime[Runtime and Operator Services]
    Identity[Keycloak and Ory Keto]
    State[Convex, PostgreSQL, Valkey, and Unleash]
    Search[Meilisearch]
    Messaging[Novu and Postal]
    Metering[OpenMeter]
    Observe[OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana, and GlitchTip]
    Edge[Edge and secrets: Kong and Vault]
    ExternalProviders[Polar billing and OpenPanel analytics boundaries]
  end

  PublicWeb --> PlatformServices
  ProductApp --> PlatformServices
  AdminApp --> PlatformServices

  PlatformServices --> Contracts
  PlatformServices --> Config
  Config --> Contracts

  Modules --> Contracts
  Modules --> Config

  PlatformAdapters --> Identity
  PlatformAdapters --> State
  PlatformAdapters --> Search
  PlatformAdapters --> Messaging
  PlatformAdapters --> Metering
  PlatformAdapters --> Observe
  PlatformAdapters --> Edge
  PlatformAdapters --> ExternalProviders

  Specs --> Contracts
  Specs --> Modules
  Specs --> PlatformServices
  Specs --> PlatformAdapters

  Tests --> Contracts
  Tests --> Modules
  Tests --> PlatformServices
  Tests --> PlatformAdapters
```

## Why This Foundation Exists

| Build once                                                                      | Govern centrally                                                             | Ship safely                                                                      |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Shared packages keep policy, contracts, and runtime behavior out of app shells. | Specs, ADRs, manifests, hooks, and workflows keep platform rules reviewable. | Security scans, commit guards, and PR validation reduce drift before code lands. |

## Current Platform Baseline

The accepted specs describe the intended platform. Current delivery maturity for each area lives in [specs/00-governance/implementation-tracker.md](specs/00-governance/implementation-tracker.md).

- Apps: TanStack Start shells for the public web and product app, plus a scaffolded admin app now centered on the tenant repair console, with first-party auth routes kept as thin request-boundary edges over shared platform helpers while backend-owned H3 routes remain the delivery gate for external callers, tooling, smoke coverage, and webhook providers.
- Shared backend: Effect-based contracts, runtime services, backend-owned HTTP APIs, typed config helpers, and a 19-manifest module catalog with per-capability maturity tracked in the implementation tracker.
- Governance: Core specs, backend-readiness roadmap, backend end-to-end test plan, 21 accepted ADRs, grouped commit enforcement, PR governance validation, and label sync.
- Platform adapters: 14 named adapter service boundaries across identity, storage, messaging, observability, search, and billing or metering concerns.
- Local ops baseline: Pinned Compose services for PostgreSQL, Keycloak, Convex, Valkey, Ory Keto, Unleash, Meilisearch, Novu, OpenMeter, Postal, GlitchTip, Prometheus, Loki, Tempo, Grafana, the OpenTelemetry Collector, OpenPanel, Kong, and Vault.
- Validation: ADR-021 Vitest-through-Bun migration, browser projects on Vitest Browser Mode, Playwright end-to-end scaffold, path-based labels, PR auto-assignment, and Trivy-backed security hygiene.

## Workflow That Keeps The Repo Clean

1. Branch from `dev` using `<type>/<scope>-<short-slug>`.
2. Let local hooks block bad branch names, malformed commit messages, mixed staged change groups, formatting drift, type regressions, and test failures before push.
3. Open a PR into `dev`; GitHub applies path-based labels automatically and auto-assigns the PR author when the author is assignable.
4. Keep the PR body aligned with `.github/pull_request_template.md`.
5. Merge only when formatting, types, tests, PR governance, label sync, and security hygiene are green.

## Quick Start

```bash
bun install
bun run hooks:install
bun run format:check
bun run typecheck
bun run test
docker compose -f ops/docker/compose.yml up -d vault
# Initialize and unseal Vault, then enable the platform KV mount per the ops runbook.
bun run ops:secrets:bootstrap
bun run ops:docker:compose -- up -d
# Provision or reuse the Vault-backed runtime credentials generated after startup.
bun run ops:runtime:bootstrap
# Generate the Convex admin key, write it to Vault, then sync the deployment env.
bun run convex:env:sync:local
bun run db:migrate:local
bun run backend:subscriber-journey:bootstrap:local
```

Use Bun for all repo-owned commands, hooks, automation, CI workflow examples, and documentation snippets. Prefer Bun-native process launching such as `Bun.spawn(...)` when Bun exposes an equivalent, and treat Bun's Node-compat modules as compatibility shims rather than a reason to switch the runtime to Node. The current runtime exception is Convex action files that must keep `"use node"`, because Convex only supports its default runtime or Node.js for those functions.

The root `bun run typecheck` and `bun run check` paths now validate coverage for every first-party TypeScript surface under `apps/`, `packages/`, `convex/`, `tooling/`, `tests/`, and `drizzle.config.ts` by comparing those files against the real file lists produced by the owning tsconfig entrypoints. Explicitly excluded surfaces stay outside that audit: non-owned trees such as `vendor/` and `node_modules/`, repo infrastructure paths such as `.git/` and `.turbo/`, root output folders `build/`, `coverage/`, and `dist/`, plus workspace app and package output folders such as `apps/*/build`, `apps/*/dist`, `packages/*/build`, and `packages/*/dist`.

Before starting the local stack, keep tracked defaults in `.env.example`, optional non-secret host overrides in ignored `.env.local`, and store generated or captured local secrets in Vault. Concrete values for placeholder-backed keys should live in Vault or a one-off shell command, not in `.env.local` or other ad hoc env files. If a legacy repo-root `.env` still exists, rerun `bun run ops:secrets:bootstrap` after Vault is available: it now treats `.env` as one-time migration input, copies placeholder-backed concrete secret values into Vault, and scrubs them from the file after a successful Vault write. The example env file still documents the three provenance categories that match the current runtime pattern: generated locally before first start, generated during bootstrap, and external-provider supplied. For the self-hosted Convex path, generate the local Convex admin key, write it back to Vault as `CONVEX_SELF_HOSTED_ADMIN_KEY`, and run `bun run convex:env:sync:local` after any deployment-managed worker env change because Convex deployment env is separate from the Compose container env. Convex actions receive the deployment URL and site URL from Convex system environment variables, not from the synced worker env file.

Use [ops/docker/README.md](ops/docker/README.md) as the operator index for first-run commands, concern-owned service groups, and the runbooks that explain bootstrap-generated values such as the Convex admin key and other service credentials. `bun run ops:runtime:bootstrap` now owns the local GlitchTip DSN, the OpenPanel backend client credentials, the Postal sender-domain reconciliation path, and the repo-owned Novu workflow seeding path alongside the existing Novu, Postal, and Unleash runtime reconciliation flow. OpenMeter remains transport-ready in the local stack, but it is not yet a backend-owned module capability.

The PostgreSQL-backed backend modules now ship with a repo-owned Drizzle workflow. For the local stack, `bun run db:generate:local` creates reviewable SQL migrations from [packages/modules/src/persistence/postgres/schema.ts](packages/modules/src/persistence/postgres/schema.ts) and `bun run db:migrate:local` applies them against the Vault-backed runtime environment. The plain `db:generate` and `db:migrate` scripts now expect `POSTGRES_URL` in the current shell and no longer read `.env` files.

The backend subscriber-journey operator flow now has three focused local entrypoints. `bun run backend:subscriber-journey:bootstrap:local` wraps the Vault-backed local Drizzle migration path, keeps the local Keycloak client redirect surface aligned with the repo defaults, and creates or updates the Keycloak smoke user. `bun run backend:subscriber-journey:local` starts the backend-owned HTTP API when you want to keep it running for manual work. `bun run backend:subscriber-journey:ready:local` is the one-command readiness path: it bootstraps the backend slice, starts the API, waits for the public plan route to respond, runs the live smoke kickoff, and then keeps the local API running so the hosted checkout return path and webhook reconciliation can complete. Stop that command with `Ctrl+C` after verification. `bun run backend:subscriber-journey:live-smoke:local` remains available when the backend API is already running and you only want to drive the live Keycloak-to-Polar kickoff through those HTTP contracts up to the hosted Polar checkout session.

The live smoke kickoff requires a real `POLAR_ACCESS_TOKEN` and a `POLAR_WEBHOOK_SECRET` captured from Polar CLI local forwarding. With the backend API running, use `polar listen http://127.0.0.1:3010/api/subscriber-journey/billing/webhooks/polar`, write the reported secret into Vault, and then run `bun run backend:subscriber-journey:live-smoke:local`. When the current organization access token is scoped to Polar sandbox, set `POLAR_API_URL=https://sandbox-api.polar.sh/v1` in `.env.local` so the local operator wrappers use the matching API host instead of the production default from `.env.example`. `SUBSCRIBER_JOURNEY_PUBLIC_BASE_URL` is now optional and only needed when you want the smoke script to print externally reachable webhook and replay URLs.

`ops/docker/compose.yml` is the only Compose entrypoint. It includes concern-owned Compose files from `ops/docker/observability/`, `ops/docker/identity/`, `ops/docker/feature-flags/`, `ops/docker/search/`, `ops/docker/messaging/`, `ops/docker/metering/`, `ops/docker/analytics/`, and `ops/docker/security/` while keeping one operator command surface.

OpenPanel analytics is part of the current platform dependency footprint and now starts by default through the main `ops/docker/compose.yml` entrypoint.

Kong and Vault are part of the current edge and secrets dependency footprint and now start by default through the same entrypoint.

See [ops/docker/README.md](ops/docker/README.md) for the compose file split, profile ownership, and common operator commands.

## Workspace Map

- `apps/`: application shells and route surfaces
- `packages/contracts/`: shared contracts, access rules, runtime schemas, and domain types
- `packages/config/`: typed defaults, environment modeling, and the module manifest registry
- `packages/modules/`: backend module implementations organized by concern
- `packages/platform/`: app snapshot and route-helper services, backend-owned HTTP APIs with shared request middleware, communication-layer request-boundary and transport helpers, platform environment helpers, and adapter boundaries
- `specs/`: governance docs, platform specs, module specs, ADRs, and ops guidance
- `tests/`: contracts, modules, and platform validation
- `ops/`: local infrastructure composition, compose profiles, and operational assets
- `.github/`: workflows, templates, labels, instructions, and automation policy

## Quality Bar

1. Shared backend behavior lives in workspace packages, not duplicated across app shells.
2. Runtime config, approvals, audit, billing, entitlements, and compliance flows use durable PostgreSQL-backed state.
3. Authorization and field-level data exposure are platform concerns, not UI-only checks.
4. Reusable vocabularies live in shared constants and schemas instead of repeated string literals.
5. Dependencies stay pinned and continuously scanned; vendor CVEs are tracked without pretending drift disappears on its own.
6. Reuse named exported schema types such as `RequestContext` instead of re-deriving `Schema.Schema.Type<typeof RequestContextSchema>` in consuming code, and keep `unknown` limited to honest decode or external-boundary cases.
7. Runtime URLs, API keys, realms, and connection strings must come from validated environment input; adapters and services must not hide localhost or credential fallbacks in code.

## Governance Entry Points

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SUPPORT.md](SUPPORT.md)
- [LICENSE](LICENSE)
- [specs/README.md](specs/README.md)
- [specs/00-governance/current-platform-overview.md](specs/00-governance/current-platform-overview.md)
- [specs/00-governance/implementation-tracker.md](specs/00-governance/implementation-tracker.md)
- [specs/00-governance/backend-readiness-roadmap.md](specs/00-governance/backend-readiness-roadmap.md)
- [specs/00-governance/backend-end-to-end-test-plan.md](specs/00-governance/backend-end-to-end-test-plan.md)
- [.github/copilot-instructions.md](.github/copilot-instructions.md)

## Local Platform Endpoints

| Surface          | URL                         | Profile   |
| ---------------- | --------------------------- | --------- |
| Public web       | `http://localhost:3000`     | default   |
| Product app      | `http://localhost:3002`     | default   |
| Admin app        | `http://localhost:3004`     | default   |
| Backend API      | `http://127.0.0.1:3010`     | on-demand |
| Convex API       | `http://127.0.0.1:3210`     | default   |
| Convex dashboard | `http://localhost:6791`     | default   |
| Keycloak         | `http://localhost:8080`     | default   |
| Ory Keto read    | `http://localhost:4466`     | default   |
| Ory Keto write   | `http://localhost:4467`     | default   |
| Unleash          | `http://localhost:4242`     | default   |
| Valkey           | `redis://localhost:6379`    | default   |
| Meilisearch      | `http://localhost:7700`     | default   |
| Novu             | `http://localhost:3101`     | default   |
| OpenMeter        | `http://localhost:8889`     | default   |
| Postal           | `http://localhost:5000`     | default   |
| GlitchTip        | `http://localhost:8001`     | default   |
| Grafana          | `http://localhost:3001`     | default   |
| Prometheus       | `http://localhost:9090`     | default   |
| Tempo            | `http://localhost:3200`     | default   |
| OpenPanel        | `http://localhost:3005`     | default   |
| OpenPanel API    | `http://localhost:3005/api` | default   |
| Kong proxy       | `http://localhost:8000`     | default   |
| Kong admin API   | `http://localhost:18001`    | default   |
| Kong manager     | `http://localhost:18002`    | default   |
| Vault            | `http://localhost:8200`     | default   |

The backend API origin is available when `bun run backend:subscriber-journey:local` or `bun run backend:subscriber-journey:ready:local` is running. Its documentation and schema surfaces are `http://127.0.0.1:3010/api/docs` and `http://127.0.0.1:3010/api/openapi.json`.
