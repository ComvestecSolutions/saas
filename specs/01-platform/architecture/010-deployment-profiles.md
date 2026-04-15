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

## Default Compose Services

Convex, PostgreSQL, Keycloak, Ory Keto, Unleash, Valkey, Meilisearch, Novu, OpenMeter, Postal, GlitchTip, OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana.

Convex-native workflow jobs use the same Convex deployment and do not require a separate Compose profile.

The checked-in Compose entrypoint remains `ops/docker/compose.yml`; it includes concern-specific files from `ops/docker/observability/compose.yml`, `ops/docker/identity/compose.yml`, `ops/docker/feature-flags/compose.yml`, `ops/docker/search/compose.yml`, `ops/docker/messaging/compose.yml`, `ops/docker/metering/compose.yml`, `ops/docker/analytics/compose.yml`, and `ops/docker/security/compose.yml` so operators keep one consistent command surface.

## Optional Compose Profiles

| Profile       | Services                                                               | Notes                                                                  |
| ------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **analytics** | OpenPanel proxy, API, dashboard, worker, PostgreSQL, Redis, ClickHouse | Optional local analytics stack that stays outside the default baseline |
| **hardened**  | Kong, Vault                                                            | Production security baseline and optional edge enforcement             |
