# 013 Technology Stack

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

Last verified against vendor release sources: 2026-05-12.

Repo-owned version verification is now split into two expectations:

1. The classification table above stays on the correct major or named product line for the foundation.
2. Repo-owned package ranges and container image tags must also stay on the latest stable release within that selected product line before a new delivery wave starts, or on the latest version inside the intentionally selected pre-release channel when the foundation is deliberately tracking an RC or beta line.

Version-verification disposition for every catalog row on 2026-05-12:

| Tool                    | Current in repo                             | 2026-05-12 disposition                      | Notes                                                                                     |
| ----------------------- | ------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Bun                     | `1.3.11`                                    | behind latest stable                        | Update to `1.3.13`.                                                                       |
| Turborepo               | `2.9.6`                                     | behind latest stable                        | Update to `2.9.12`.                                                                       |
| Vitest                  | resolved `4.1.5`                            | behind latest stable                        | Update the repo Vitest family to `4.1.6`.                                                 |
| Vitest browser mode     | resolved `4.1.5`                            | behind latest stable                        | Update `@vitest/browser-playwright` to `4.1.6`.                                           |
| Playwright              | `1.59.1`                                    | behind latest stable                        | Update to `1.60.0`.                                                                       |
| TanStack Start          | `1.167.16`                                  | behind latest stable                        | Update to `1.167.65`.                                                                     |
| H3 v2                   | `2.0.1-rc.20`                               | behind selected pre-release channel         | Update to `2.0.1-rc.22`.                                                                  |
| Effect                  | `3.21.0`                                    | behind latest stable                        | Update to `3.21.2`.                                                                       |
| TypeScript 6            | `6.0.2`                                     | behind latest stable                        | Update to `6.0.3`.                                                                        |
| Convex (self-hosted)    | npm `1.35.1`; backend/dashboard image SHAs  | mixed: package behind, images pending       | Update the npm package to `1.38.0`; refresh image SHAs as an artifact-specific follow-up. |
| PostgreSQL 18           | `18.3-alpine3.23`                           | current                                     | Docker Hub `18` line matched the repo pin checked in this pass.                           |
| Drizzle                 | `drizzle-kit 0.31.10`, `drizzle-orm 0.45.2` | current                                     | Bun package audit did not surface a newer stable version for the repo-owned packages.     |
| Keycloak 26             | `26.6.0`                                    | behind latest stable                        | Update to `26.6.1`.                                                                       |
| Ory Keto                | `v0.14.0`                                   | current                                     | Docker Hub `0.14` line matched the repo pin checked in this pass.                         |
| Unleash                 | server `7.6.1`; client `6.10.1`             | behind latest stable                        | Update server to `7.6.3` and client to `6.11.0`.                                          |
| Valkey 9                | `9.0.3-trixie`                              | behind latest stable                        | Update to `9.0.4-trixie`.                                                                 |
| OpenTelemetry Collector | `0.149.0`                                   | behind latest stable                        | Update to `0.151.0`.                                                                      |
| Prometheus              | `3.11.1-distroless`                         | behind latest stable                        | Update to `3.11.3-distroless`.                                                            |
| Loki                    | `3.7.1`                                     | current                                     | Latest checked release matched the repo pin.                                              |
| Tempo                   | `2.8.3`                                     | behind latest stable                        | Update to `2.10.5`.                                                                       |
| Grafana OSS 13          | `12.4.2`                                    | behind latest stable                        | Update to `13.0.1` to align the selected product line with the latest stable release.     |
| OpenPanel (self-hosted) | `2.0.0`                                     | current                                     | `2.0.1` is currently only an RC tag; `2.0.0` remains the latest stable image line.        |
| GlitchTip               | floating major tag `6`                      | current via major-tag policy                | The repo tracks the latest stable `6.x` line; switch to an explicit patch tag if needed.  |
| Convex native workflows | bundled in Convex                           | inherits Convex status                      | Treat workflow runtime refresh together with the Convex package and image update.         |
| Novu                    | `3.14.0`                                    | pending registry-specific verification      | Refresh alongside the messaging image bump so the exact GHCR artifact is checked.         |
| Polar                   | SDK `0.47.0`                                | behind latest stable                        | Update SDK to `0.47.1`.                                                                   |
| OpenMeter               | `1.0.0-beta.227`                            | current within selected pre-release channel | Latest checked release matched the repo pin.                                              |
| Meilisearch             | `1.41.0`                                    | behind latest stable                        | Update to `1.43.0`.                                                                       |
| Postal                  | `3.3.4`                                     | behind latest stable                        | Update to `3.3.6`.                                                                        |
| Kong                    | `3.9.1`                                     | current                                     | Latest checked release matched the repo pin.                                              |
| Vault                   | `1.21.4`                                    | behind latest stable                        | Latest container tag is `2.0.0`; plan the upgrade explicitly for the hardened profile.    |

Anything marked `behind latest stable` is part of the required refresh backlog before the next delivery wave. Anything marked `pending registry-specific verification` or `mixed` must not be treated as already current.

The platform does not claim that every pinned image is permanently CVE-free. Instead, pinned versions are kept current and continuously checked through `bun audit`, Dependabot, and Trivy image/filesystem/config scans.

## Docker Hardened Images Policy

Docker Hardened Images are the preferred base-image policy for future first-party application containers. They are not a drop-in replacement for vendor-owned infrastructure images in this stack, because those services depend on upstream-maintained runtime layouts, entrypoints, and patch cadences.

## Selection criteria

Every dependency satisfies the policy in ADR-005:

1. Open-source and self-hostable.
2. Realistic managed-service migration path exists.
3. Does not lock the platform into a single vendor API shape without an adapter boundary.
