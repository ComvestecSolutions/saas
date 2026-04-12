# Security Policy

## Dependency Policy

1. All newly introduced npm dependencies must use the current stable release line at the time of introduction.
2. Prerelease, beta, rc, next, canary, or nightly versions are not allowed unless explicitly approved in an ADR.
3. All committed Docker and container references must use explicit version tags instead of `latest`.
4. High and critical vulnerabilities must block merge for runtime dependencies and production container definitions unless there is a documented temporary exception.

## Required Controls

1. Dependabot keeps npm, Docker, and GitHub Actions references current.
2. CI runs `bun audit` for JavaScript dependencies.
3. CI runs Trivy against the filesystem and infrastructure configuration.
4. Future container images in Compose files must be chosen from current stable release lines and scanned before merge.

## Current Stable Baseline

These are the current stable versions verified during bootstrap on 2026-04-04 for the packages already present in the repository:

1. `turbo` 2.9.3
2. `typescript` 6.0.2
3. `effect` 3.21.0
4. `jest` 30.3.0
5. `ts-jest` 29.4.9
6. `@types/jest` 30.0.0
7. `@types/node` 25.5.2
8. `@playwright/test` 1.59.1

## Container Baseline Guidance

The Docker daemon was not available locally during bootstrap, so image versions should be pinned from upstream release sources rather than relying on unresolved `latest` tags. Current stable upstream release signals gathered on 2026-04-04 include:

1. Keycloak 26.5.7
2. PostgreSQL 17.9 or 18.3 depending on selected major support policy
3. Grafana 12.4.x line
4. Loki 3.7.0
5. Prometheus 3.11.0
6. Valkey 9.0.3

When we commit Compose files, we should pin exact versions from these lines and re-check advisories before merge.
