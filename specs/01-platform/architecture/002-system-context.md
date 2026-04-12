# 002 System Context

Status: accepted

## Top-Level Shape

The platform is a modular monolith in a Turborepo with three first-class applications:

1. `public-web`: marketing site, documentation entry, pricing, trust, and lead capture.
2. `product-app`: authenticated end-user application shell and reusable SaaS experience.
3. `admin-app`: internal operating surface for platform admins, support, compliance, and product operators.

## Shared Platform Layers

1. Shared contracts and schemas.
2. Shared domain modules.
3. Shared UI primitives and design tokens.
4. Shared authorization, config, observability, and security infrastructure.

## Data Ownership

1. Convex owns interactive app state, collaboration flows, reactive views, and file storage.
2. PostgreSQL owns audit logs, effective runtime config, config history, sync state, permission overrides, billing, metering, compliance artifacts, and evidence-friendly reporting support.

## External Platform Services

1. Keycloak for authentication and identity lifecycle.
2. Convex for interactive application state and file storage.
3. PostgreSQL + Drizzle for audit, runtime configuration, permission overrides, billing, metering, and compliance-heavy system records.
4. Ory Keto for relationship-based fine-grained authorization.
5. Unleash for feature-flag runtime evaluation and toggle management.
6. Valkey for cache and rate-limit state.
7. OpenTelemetry Collector, Prometheus, Loki, Tempo, and Grafana for observability.
8. Meilisearch for full-text and faceted search.
9. Novu for multi-channel notifications.
10. Polar + OpenMeter for billing and usage metering.
11. Postal for transactional email delivery.
12. PostHog for product analytics (adapter boundary, compose deferred).
13. GlitchTip for error tracking (adapter boundary, default Compose service).
14. Convex-native workflows for background jobs and schedules (existing Convex boundary, future external-runner seam).
15. Kong and Vault for hardened deployment profiles only.

## Boundary Rules

1. Modules communicate through contracts and application services.
2. No module may write directly to another module's persistence model.
3. The admin app may inspect and operate the system, but it does not bypass audit rules.
4. Cross-module operations must use module-owned services and declared capability contracts rather than ad hoc table, bucket, or cache access.
