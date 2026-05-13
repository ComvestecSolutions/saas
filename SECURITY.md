# Security Policy

## Dependency Policy

1. All newly introduced npm dependencies must use the current stable release line at the time of introduction.
2. Prerelease, beta, rc, next, canary, or nightly versions are not allowed unless explicitly approved in an ADR.
3. All committed Docker and container references must use explicit version tags instead of `latest`.
4. High and critical vulnerabilities must block merge for runtime dependencies and production container definitions unless there is a documented temporary exception.

## Required Controls

1. Dependabot keeps npm, Docker, and GitHub Actions references current through `.github/dependabot.yml`.
2. The GitHub Actions security hygiene workflow runs `bun audit` for JavaScript dependencies.
3. The same workflow runs Trivy filesystem, configuration, and container-image scans against the committed repository surface.
4. Future container images in Compose files must stay explicitly pinned and pass the same security-hygiene gates before merge.

## Current Package Baseline

These are the current package versions committed in `package.json` on 2026-05-13 for the repository-level tools called out most often in security reviews:

1. `turbo` 2.9.12
2. `typescript` 6.0.3
3. `effect` 3.21.2
4. `vitest` 4.1.6
5. `@vitest/browser-playwright` 4.1.6
6. `@vitest/coverage-v8` 4.1.6
7. `@playwright/test` 1.60.0
8. `@types/node` 25.6.0

## Active Prerelease Exceptions

These prerelease pins are currently present in the repository and should stay explicit in security and governance review:

1. `h3-v2` resolves to `h3@2.0.1-rc.22` and `h3` is overridden to `2.0.1-rc.22` under the accepted H3 transport decision in ADR-018.
2. OpenMeter is pinned to `ghcr.io/openmeterio/openmeter:v1.0.0-beta.227`; keep that exception visible until the repository either records or removes the required ADR-backed approval.

## Current Compose Baseline

These are the exact image tags currently committed under `ops/docker/**/*.yml` on 2026-05-13:

1. Core platform: PostgreSQL `18.3-alpine3.23`, Valkey `9.0.4-trixie`, Keycloak `26.6.1`, Convex backend and dashboard `4499dd4fd7f2148687a7774599c613d052950f46`
2. Access and governance dependencies: Ory Keto `v0.14.0`, Unleash server `7.6.3`, Meilisearch `v1.43.0`
3. Observability: OpenTelemetry Collector `0.151.0`, Prometheus `v3.11.3-distroless`, Loki `3.7.1`, Grafana `13.0.1`, Tempo `2.10.5`, GlitchTip `6`
4. Analytics: OpenPanel API, dashboard, and worker `2.0.0`, analytics PostgreSQL `14-alpine`, analytics Redis `7.2.5-alpine`, ClickHouse `25.10.2.65`, Caddy `2-alpine`
5. Messaging and metering: Novu API/dashboard `3.15.0`, Novu worker/ws `3.14.0`, Postal `3.3.6`, OpenMeter `v1.0.0-beta.227`
6. Edge and secrets: Kong `3.9.1`, Vault `2.0.0`

Update this section in the same change whenever a pinned package version or image tag changes.
