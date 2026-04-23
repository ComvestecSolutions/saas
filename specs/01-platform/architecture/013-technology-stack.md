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
| Dashboards                                          | Grafana OSS 12          | Docker                 | Grafana Cloud                |
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

## Version Verification

Last verified against vendor release sources: 2026-04-15.

Verified current pins in this repository:

1. Bun `1.3.11`
2. Meilisearch `v1.41.0`
3. Novu API `3.14.0`
4. Core Compose baseline pins from the 2026-04-04 verification pass remain in place unless superseded here.
5. Default GlitchTip service tracks the official `glitchtip/glitchtip:6` major tag.
6. OpenPanel services pin `lindesvard/openpanel-api`, `lindesvard/openpanel-dashboard`, and `lindesvard/openpanel-worker` to `2.0.0`, with the public host routed through the repo-managed Caddy proxy in `ops/docker/analytics/Caddyfile`.
7. Kong and Vault pin to `3.9.1` and `1.21.4` respectively.

The platform does not claim that every pinned image is permanently CVE-free. Instead, pinned versions are kept current and continuously checked through `bun audit`, Dependabot, and Trivy image/filesystem/config scans.

## Docker Hardened Images Policy

Docker Hardened Images are the preferred base-image policy for future first-party application containers. They are not a drop-in replacement for vendor-owned infrastructure images in this stack, because those services depend on upstream-maintained runtime layouts, entrypoints, and patch cadences.

## Selection criteria

Every dependency satisfies the policy in ADR-005:

1. Open-source and self-hostable.
2. Realistic managed-service migration path exists.
3. Does not lock the platform into a single vendor API shape without an adapter boundary.
