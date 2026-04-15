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

## Current Platform Slice

| Area               | What is already in place                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apps               | TanStack Start shells for the public web, product app, and admin app                                                                                                                                    |
| Shared backend     | Effect-based contracts, runtime services, backend-owned HTTP APIs, typed config helpers, and 19 module manifests                                                                                        |
| Governance         | Core specs, backend-readiness roadmap, 16 accepted ADRs, grouped commit enforcement, PR governance validation, and label sync                                                                           |
| Platform adapters  | 14 adapters across identity, storage, messaging, observability, search, and billing or metering concerns                                                                                                |
| Local ops baseline | Pinned Compose services for PostgreSQL, Keycloak, Convex, Valkey, Ory Keto, Unleash, Meilisearch, Novu, OpenMeter, Postal, GlitchTip, Prometheus, Loki, Tempo, Grafana, and the OpenTelemetry Collector |
| Validation         | Jest through Bun, Playwright scaffold, path-based labels, PR auto-assignment, and Trivy-backed security hygiene                                                                                         |

## Workflow That Keeps The Repo Clean

1. Branch from `dev` using `<type>/<scope>-<short-slug>`.
2. Let local hooks block bad branch names, malformed commit messages, and mixed staged change groups before push.
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
docker compose --env-file .env -f ops/docker/compose.yml up -d
```

Before starting the local stack, copy `.env.example` to `.env` if you have not already done so. The example env file now uses three provenance categories that match the current runtime pattern: seeded locally, generated during bootstrap, and external-provider supplied. Leave the seeded local defaults in place, then replace only the bootstrap-generated or external-provider sentinel values when those services are actually provisioned.

`ops/docker/compose.yml` is the only Compose entrypoint. It includes concern-owned Compose files from `ops/docker/observability/`, `ops/docker/identity/`, `ops/docker/feature-flags/`, `ops/docker/search/`, `ops/docker/messaging/`, `ops/docker/metering/`, `ops/docker/analytics/`, and `ops/docker/security/` while keeping one operator command surface.

OpenPanel analytics is available through the optional `analytics` profile in `ops/docker/compose.yml`. Start it with `docker compose --env-file .env -f ops/docker/compose.yml --profile analytics up -d` when you need the local analytics stack.

Kong and Vault are available through the optional `hardened` profile in the same entrypoint. Start them with `docker compose --env-file .env -f ops/docker/compose.yml --profile hardened up -d` when you need the edge or secrets-management surface.

See [ops/docker/README.md](ops/docker/README.md) for the compose file split, profile ownership, and common operator commands.

## Workspace Map

- `apps/`: application shells and route surfaces
- `packages/contracts/`: shared contracts, access rules, runtime schemas, and domain types
- `packages/config/`: typed defaults, environment modeling, and the module manifest registry
- `packages/modules/`: backend module implementations organized by concern
- `packages/platform/`: app snapshot services, backend-owned HTTP APIs, platform environment helpers, and adapter boundaries
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
- [specs/00-governance/implementation-tracker.md](specs/00-governance/implementation-tracker.md)
- [specs/00-governance/backend-readiness-roadmap.md](specs/00-governance/backend-readiness-roadmap.md)
- [.github/copilot-instructions.md](.github/copilot-instructions.md)

## Local Platform Endpoints

| Surface          | URL                         | Profile   |
| ---------------- | --------------------------- | --------- |
| Public web       | `http://localhost:3000`     | default   |
| Product app      | `http://localhost:3002`     | default   |
| Admin app        | `http://localhost:3004`     | default   |
| Convex API       | `http://127.0.0.1:3210`     | default   |
| Convex dashboard | `http://localhost:6791`     | default   |
| Keycloak         | `http://localhost:8080`     | default   |
| Ory Keto read    | `http://localhost:4466`     | default   |
| Ory Keto write   | `http://localhost:4467`     | default   |
| Unleash          | `http://localhost:4242`     | default   |
| Valkey           | `redis://localhost:6379`    | default   |
| Meilisearch      | `http://localhost:7700`     | default   |
| Novu             | `http://localhost:3100`     | default   |
| OpenMeter        | `http://localhost:8889`     | default   |
| Postal           | `http://localhost:5000`     | default   |
| GlitchTip        | `http://localhost:8001`     | default   |
| Grafana          | `http://localhost:3001`     | default   |
| Prometheus       | `http://localhost:9090`     | default   |
| Tempo            | `http://localhost:3200`     | default   |
| OpenPanel        | `http://localhost:3005`     | analytics |
| OpenPanel API    | `http://localhost:3005/api` | analytics |
| Kong proxy       | `http://localhost:8000`     | hardened  |
| Kong admin API   | `http://localhost:18001`    | hardened  |
| Kong manager     | `http://localhost:18002`    | hardened  |
| Vault            | `http://localhost:8200`     | hardened  |
