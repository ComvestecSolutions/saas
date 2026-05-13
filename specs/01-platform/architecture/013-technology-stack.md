# 013 Technology Stack

Status: accepted

## Purpose

Canonical list of every runtime dependency the SaaS foundation relies on, with explicit hosting model and swap-path notes. Every integration listed here must have a corresponding adapter under the concern folders in `packages/platform/src/adapters/` and flow through `packages/platform/src/adapters/index.ts`, or must explicitly run on top of an already-listed platform adapter when the capability is part of an existing service boundary.

## Integration Boundary Pattern

1. Listing a dependency here justifies an adapter boundary; it does not mean the full workflow is implemented.
2. A dependency is only considered foundation-ready when its adapter validates runtime-facing configuration with Effect Schema, exposes typed Effect methods and health probes, and hides vendor payload shapes behind platform contracts.
3. A dependency remains scaffolded until an owning module or service consumes it and the operator or admin workflow that depends on it is explicit.
4. A dependency only reaches validated quality after the external-service boundary has a real validation path in addition to unit tests.

## Classification

| Category                                            | Tool                    | Hosting                | Swap path                    |
| --------------------------------------------------- | ----------------------- | ---------------------- | ---------------------------- |
| Package manager / runner                            | Bun                     | Local CLI              | —                            |
| Monorepo orchestration                              | Turborepo               | Local CLI              | —                            |
| Unit / integration test runner                      | Vitest                  | Bun scripts            | Bun test                     |
| Browser / component test runner                     | Vitest browser mode     | Bun scripts            | Playwright component tests   |
| End-to-end test runner                              | Playwright              | Bun scripts            | Vitest browser mode          |
| SSR / routing framework                             | TanStack Start          | Bundled                | —                            |
| Backend HTTP / API layer                            | H3 v2                   | Bundled                | Hono / raw Bun               |
| Runtime backbone                                    | Effect                  | Bundled                | —                            |
| Language                                            | TypeScript 6            | Bundled                | —                            |
| Interactive app state + files                       | Convex (self-hosted)    | Docker (backend image) | Convex Cloud                 |
| System records (audit, config, billing, compliance) | PostgreSQL 18           | Docker                 | Any managed PostgreSQL       |
| ORM / query builder                                 | Drizzle                 | Bundled                | —                            |
| Authentication / identity                           | Keycloak 26             | Docker                 | Any OIDC provider            |
| Relationship-based authorization                    | Ory Keto                | Docker                 | Ory Network                  |
| Feature flags                                       | Unleash                 | Docker                 | Unleash Cloud / LaunchDarkly |
| Cache / rate-limit                                  | Valkey 9                | Docker                 | Redis Cloud / ElastiCache    |
| Observability collector                             | OpenTelemetry Collector | Docker                 | Any OTLP endpoint            |
| Metrics                                             | Prometheus              | Docker                 | Grafana Cloud / Datadog      |
| Logs                                                | Loki                    | Docker                 | Grafana Cloud                |
| Traces                                              | Tempo                   | Docker (volume-backed) | Grafana Cloud                |
| Dashboards                                          | Grafana OSS 13          | Docker                 | Grafana Cloud                |
| Analytics                                           | OpenPanel (self-hosted) | Docker Compose         | OpenPanel Cloud              |
| Error tracking                                      | GlitchTip               | Docker                 | GlitchTip Cloud              |
| Background jobs / workflows                         | Convex native workflows | Bundled in Convex      | Future external job adapter  |
| Notifications                                       | Novu                    | Docker                 | Novu Cloud                   |
| Billing                                             | Polar                   | External SaaS          | Stripe / Paddle              |
| Metering                                            | OpenMeter               | Docker                 | OpenMeter Cloud              |
| Search                                              | Meilisearch             | Docker                 | Meilisearch Cloud / Algolia  |
| Email delivery                                      | Postal                  | Docker                 | Resend / Postmark / SES      |
| API gateway (hardened profile)                      | Kong                    | Docker                 | Kong Konnect                 |
| Secrets management (hardened profile)               | Vault                   | Docker                 | HCP Vault                    |

## Docker Compose service groups

The checked-in Compose entrypoint is `ops/docker/compose.yml`, which preserves one operator command surface while including concern-specific files from `ops/docker/observability/compose.yml`, `ops/docker/identity/compose.yml`, `ops/docker/feature-flags/compose.yml`, `ops/docker/search/compose.yml`, `ops/docker/messaging/compose.yml`, `ops/docker/metering/compose.yml`, `ops/docker/analytics/compose.yml`, and `ops/docker/security/compose.yml`.

PostgreSQL remains the shared database engine for the local baseline, but the repository treats service database ownership as a boundary concern. The platform system-of-record database and service-owned databases such as Convex, Keycloak, Ory Keto, Unleash, OpenMeter, and GlitchTip must remain logically isolated even when they run on the same PostgreSQL container.

1. The main entrypoint starts the current full platform dependency footprint by default.
2. `analytics/`: OpenPanel proxy, API, dashboard, worker, PostgreSQL, Redis, and ClickHouse.
3. `security/`: Kong and Vault.

## Validation stack

Repository-owned validation uses two distinct paths:

1. Non-browser unit and integration tests run on Vitest and are invoked through Bun package scripts so the operator surface stays Bun-first without switching to Bun's built-in `bun test` runner.
2. Browser and component tests run on Vitest Browser Mode with a Playwright provider so app-shell tests exercise real browser behavior when `window`, `document`, or browser interactions are part of the contract.
3. The separate `packages/e2e` Playwright suite remains the end-to-end layer and is not folded into Vitest Browser Mode.

## Version Verification

Last verified against vendor release sources: 2026-05-13.

Repo-owned version verification is now split into two expectations:

1. The classification table above stays on the correct major or named product line for the foundation.
2. Repo-owned package ranges and container image tags must also stay on the latest stable release within that selected product line before a new delivery wave starts, or on the latest version inside the intentionally selected pre-release channel when the foundation is deliberately tracking an RC or beta line.

Version-verification disposition for every catalog row on 2026-05-12:

| Tool                    | Current in repo                                                                        | 2026-05-12 disposition                      | Notes                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Bun                     | `1.3.13`                                                                               | current                                     | Repo pin now matches the latest stable Bun release used for the admin start gate.                                               |
| Turborepo               | `2.9.12`                                                                               | current                                     | Repo pin now matches the latest stable Turborepo release checked in this pass.                                                  |
| Vitest                  | resolved `4.1.6`                                                                       | current                                     | Repo Vitest family now matches the latest stable release checked in this pass.                                                  |
| Vitest browser mode     | resolved `4.1.6`                                                                       | current                                     | `@vitest/browser-playwright` now matches the latest stable release checked in this pass.                                        |
| Playwright              | `1.60.0`                                                                               | current                                     | Repo pin now matches the latest stable Playwright release checked in this pass.                                                 |
| TanStack Start          | `1.167.65`                                                                             | current                                     | Admin-app-facing TanStack Start pins now match the latest stable release checked in this pass.                                  |
| H3 v2                   | `2.0.1-rc.22`                                                                          | current within selected pre-release channel | Repo pin now matches the latest approved H3 v2 RC in the selected pre-release line.                                             |
| Effect                  | `3.21.2`                                                                               | current                                     | Repo pin now matches the latest stable Effect release checked in this pass.                                                     |
| TypeScript 6            | `6.0.3`                                                                                | current                                     | Repo pin now matches the latest stable TypeScript 6 release checked in this pass.                                               |
| Convex (self-hosted)    | npm `1.38.0`; backend/dashboard commit pins `4499dd4fd7f2148687a7774599c613d052950f46` | current                                     | The npm package and the latest public explicit GHCR backend/dashboard commit pins were refreshed together in this pass.         |
| PostgreSQL 18           | `18.3-alpine3.23`                                                                      | current                                     | Docker Hub `18` line matched the repo pin checked in this pass.                                                                 |
| Drizzle                 | `drizzle-kit 0.31.10`, `drizzle-orm 0.45.2`                                            | current                                     | Bun package audit did not surface a newer stable version for the repo-owned packages.                                           |
| Keycloak 26             | `26.6.1`                                                                               | current                                     | Repo pin now matches the latest stable Keycloak 26 release checked in this pass.                                                |
| Ory Keto                | `v0.14.0`                                                                              | current                                     | Docker Hub `0.14` line matched the repo pin checked in this pass.                                                               |
| Unleash                 | server `7.6.3`; client `6.11.0`                                                        | current                                     | Repo server and client pins now match the latest stable releases checked in this pass.                                          |
| Valkey 9                | `9.0.4-trixie`                                                                         | current                                     | Repo pin now matches the latest stable Valkey 9 release checked in this pass.                                                   |
| OpenTelemetry Collector | `0.151.0`                                                                              | current                                     | Repo pin now matches the latest stable collector release checked in this pass.                                                  |
| Prometheus              | `3.11.3-distroless`                                                                    | current                                     | Repo pin now matches the latest stable Prometheus release checked in this pass.                                                 |
| Loki                    | `3.7.1`                                                                                | current                                     | Latest checked release matched the repo pin.                                                                                    |
| Tempo                   | `2.10.5`                                                                               | current                                     | Repo pin now matches the latest stable Tempo release checked in this pass.                                                      |
| Grafana OSS 13          | `13.0.1`                                                                               | current                                     | Repo pin now matches the latest stable Grafana OSS 13 release checked in this pass.                                             |
| OpenPanel (self-hosted) | `2.0.0`                                                                                | current                                     | `2.0.1` is currently only an RC tag; `2.0.0` remains the latest stable image line.                                              |
| GlitchTip               | floating major tag `6`                                                                 | current via major-tag policy                | The repo tracks the latest stable `6.x` line; switch to an explicit patch tag if needed.                                        |
| Convex native workflows | bundled in Convex                                                                      | inherits Convex status                      | Workflow runtime inherits the refreshed Convex package and public self-hosted image pins.                                       |
| Novu                    | API/dashboard `3.15.0`; worker/ws `3.14.0`                                             | current                                     | Latest stable GHCR tags are split by component; the repo now pins each container to the newest stable tag checked in this pass. |
| Polar                   | SDK `0.47.1`                                                                           | current                                     | Repo pin now matches the latest stable Polar SDK release checked in this pass.                                                  |
| OpenMeter               | `1.0.0-beta.227`                                                                       | current within selected pre-release channel | Latest checked release matched the repo pin.                                                                                    |
| Meilisearch             | `1.43.0`                                                                               | current                                     | Repo pin now matches the latest stable Meilisearch release checked in this pass.                                                |
| Postal                  | `3.3.6`                                                                                | current                                     | Repo pin now matches the latest stable Postal release checked in this pass.                                                     |
| Kong                    | `3.9.1`                                                                                | current                                     | Latest checked release matched the repo pin.                                                                                    |
| Vault                   | `2.0.0`                                                                                | current                                     | Repo pin now matches the latest stable Vault release checked in this pass.                                                      |

The 2026-05-13 refresh cleared the previously behind-latest rows that participate in local development, validation, and the initial admin-app delivery wave. Keep this table current when upstream releases move again, and keep the selected H3 and OpenMeter pre-release channels explicit until their accepted ADR-backed exceptions are retired.

The platform does not claim that every pinned image is permanently CVE-free. Instead, pinned versions are kept current and continuously checked through `bun audit`, Dependabot, and Trivy image/filesystem/config scans.

## Docker Hardened Images Policy

Docker Hardened Images are the preferred base-image policy for future first-party application containers. They are not a drop-in replacement for vendor-owned infrastructure images in this stack, because those services depend on upstream-maintained runtime layouts, entrypoints, and patch cadences.

## Selection criteria

Every dependency satisfies the policy in ADR-005:

1. Open-source and self-hostable.
2. Realistic managed-service migration path exists.
3. Does not lock the platform into a single vendor API shape without an adapter boundary.
