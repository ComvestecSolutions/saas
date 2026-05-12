# 010 Deployment Profiles

Status: accepted

## Primary Profile

Docker Compose is the first-class self-hosted profile for local development, single-host deployment, and smaller customer environments.

## Secondary Profile

The platform should remain Kubernetes-ready without forcing Kubernetes complexity into the first delivery slice.

## Deployment Principles

1. Prefer open-source self-hostable services.
2. Keep dependency boundaries adapter-friendly so managed variants are a deployment concern.
3. Avoid runtime behavior that depends on a single cloud vendor primitive.
4. Commit pinned stable image tags for Compose baselines and rotate them through automated update workflows.
5. Keep local deployment profiles operationally complete: identity, state, cache, authorization, feature flags, search, notifications, email, metering, logs, metrics, traces, and dashboard surfaces must boot together.
6. Use Docker Hardened Images for first-party application containers when the platform begins shipping app Dockerfiles; do not replace vendor-owned infrastructure images such as PostgreSQL, Keycloak, Grafana, or Meilisearch with generic hardened base images.
7. Custom-domain hostname mapping, certificate issuance, and TLS termination are deployment-edge responsibilities. App routes consume resolved host context and effective branding, but they do not own domain verification or certificate management.
8. Concern-owned included Compose files may group related services, but current platform dependencies should not rely on profile gating when the runtime environment requires them.
9. A shared local PostgreSQL engine may host multiple services, but each platform-owned or third-party service must use a dedicated logical database. Do not point Keycloak, Ory Keto, Unleash, Convex, OpenMeter, GlitchTip, or similar service-owned state at the platform system-of-record database.
10. The checked-in local Compose project currently represents vendor-managed infrastructure only. When the repository begins shipping first-party application or backend containers, place them in a separate project grouping from the vendor-infrastructure baseline so operators can distinguish vendor services from repo-owned runtimes at a glance.

## Default Compose Services

Convex, PostgreSQL, Keycloak, Ory Keto, Unleash, Valkey, Meilisearch, Novu, OpenMeter, Postal, GlitchTip, OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana, OpenPanel, Kong, and Vault.

Convex-native workflow jobs use the same Convex deployment and do not require a separate Compose profile.

The checked-in Compose entrypoint remains `ops/docker/compose.yml`; it includes concern-specific files from `ops/docker/observability/compose.yml`, `ops/docker/identity/compose.yml`, `ops/docker/feature-flags/compose.yml`, `ops/docker/search/compose.yml`, `ops/docker/messaging/compose.yml`, `ops/docker/metering/compose.yml`, `ops/docker/analytics/compose.yml`, and `ops/docker/security/compose.yml` so operators keep one consistent command surface.

PostgreSQL-backed services in the default profile may share the same local PostgreSQL server process, but they do not share one database. The platform system-of-record database remains isolated from service-owned databases such as Convex, Keycloak, Ory Keto, Unleash, OpenMeter, and GlitchTip.

## Concern-Owned Service Groups

1. `analytics/`: OpenPanel proxy, API, dashboard, worker, PostgreSQL, Redis, and ClickHouse.
2. `security/`: Kong and Vault.
