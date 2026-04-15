# Docker Compose Layout

This folder owns the repository-managed local deployment surface for the Comvestec SaaS foundation.

`compose.yml` is the only entrypoint. It uses Compose `include` so operators keep one command surface while the stack is split into concern-focused files.

## Compose Files

- `compose.yml`: core baseline services such as PostgreSQL, Valkey, Keycloak, and Convex
- `observability/compose.yml`: OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana, and GlitchTip
- `identity/compose.yml`: Ory Keto alongside the core identity baseline
- `feature-flags/compose.yml`: Unleash
- `search/compose.yml`: Meilisearch
- `messaging/compose.yml`: Novu and Postal
- `metering/compose.yml`: OpenMeter
- `analytics/compose.yml`: OpenPanel services behind the optional `analytics` profile, plus the local analytics proxy and ClickHouse bootstrap assets
- `security/compose.yml`: Kong and Vault behind the optional `hardened` profile, plus the local security runtime assets

## Asset Folders

- `observability/`: observability compose file plus Grafana, Loki, OTel Collector, Prometheus, and Tempo runtime assets
- `identity/`: identity compose file plus the checked-in Keycloak realm export
- `analytics/`: OpenPanel compose file plus the local proxy and ClickHouse bootstrap assets
- `security/`: Kong and Vault compose file plus the DB-less Kong and Vault server config assets
- `feature-flags/`, `search/`, `messaging/`, `metering/`: concern folders that currently hold only the included Compose files

## Environment Provenance

The checked-in `.env.example` mirrors the current runtime expectations and uses three value categories:

- `seeded locally`: the repository or local Compose defaults already define a working value
- `generated during bootstrap`: capture the value after the local service is running, for example the Convex admin key, GlitchTip DSN, or OpenPanel client id
- `external provider`: supply the value from a provider or operator-managed system outside the repo-local stack, for example Polar credentials

Do not replace seeded local defaults with placeholders. Replace only the bootstrap-generated or external-provider sentinels when those services are actually provisioned.

## Common Commands

Start the default local baseline:

```bash
docker compose --env-file .env -f ops/docker/compose.yml up -d
```

Start the default baseline plus OpenPanel analytics:

```bash
docker compose --env-file .env -f ops/docker/compose.yml --profile analytics up -d
```

Start the default baseline plus Kong and Vault:

```bash
docker compose --env-file .env -f ops/docker/compose.yml --profile hardened up -d
```

Render the final merged Compose model without starting containers:

```bash
docker compose --env-file .env -f ops/docker/compose.yml config --quiet
docker compose --env-file .env -f ops/docker/compose.yml --profile analytics config --quiet
docker compose --env-file .env -f ops/docker/compose.yml --profile hardened config --quiet
```

Stop everything that belongs to the repo-managed deployment surface:

```bash
docker compose --env-file .env -f ops/docker/compose.yml down
```

## Profile Notes

- `analytics` is optional and keeps OpenPanel out of the default baseline.
- `hardened` is optional and keeps Kong plus Vault off the default baseline.
- Kong keeps the public proxy on `8000` and moves admin surfaces to `18001` and `18002` so the hardened profile can run beside GlitchTip on `8001`.
- Vault starts in normal server mode, not dev mode. Initialize and unseal it before treating it as ready.

## Runbooks

- [OpenPanel Self-Hosting Runbook](../../specs/04-ops/runbooks/openpanel-self-hosting.md)
- [Kong And Vault Bootstrap Runbook](../../specs/04-ops/runbooks/kong-vault-bootstrap.md)
