# Docker Compose Layout

This folder owns the repository-managed local deployment surface for the Comvestec SaaS foundation.

`compose.yml` is the only entrypoint. It uses Compose `include` so operators keep one command surface while the stack is split into concern-focused files.

The default local profile keeps one shared PostgreSQL engine, but it does not keep one shared logical database. The platform system-of-record tables stay in the `comvestec` database, while service-owned state such as Convex, Keycloak, Ory Keto, Unleash, OpenMeter, and GlitchTip is isolated into dedicated databases on that same local PostgreSQL instance.

## Compose Files

- `compose.yml`: core baseline services such as PostgreSQL, Valkey, Keycloak, and Convex
- `observability/compose.yml`: OpenTelemetry Collector, Prometheus, Loki, Tempo, Grafana, and GlitchTip
- `identity/compose.yml`: Ory Keto alongside the core identity baseline
- `feature-flags/compose.yml`: Unleash
- `search/compose.yml`: Meilisearch
- `messaging/compose.yml`: Novu and Postal
- `metering/compose.yml`: OpenMeter
- `analytics/compose.yml`: OpenPanel services, plus the local analytics proxy and ClickHouse bootstrap assets
- `security/compose.yml`: Kong and Vault, plus the local security runtime assets

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

## First Run

1. Copy `.env.example` to `.env`.
2. Keep the seeded local values unless you have a concrete reason to override them.
3. Start the current full local platform footprint with `docker compose --env-file .env -f ops/docker/compose.yml up -d`.
4. Capture bootstrap-generated values as the local services come online and write them back to `.env`.
5. After the Convex admin key is present in `.env`, run `bun run convex:env:sync` whenever the deployment-managed worker values change so the active Convex deployment gets the current Postgres, Keycloak, Polar, Valkey, and Keto settings.
6. Use service-specific `up`, `restart`, `logs`, or `ps` commands only when you are intentionally troubleshooting a subset of the platform.
7. Run `bun run backend:subscriber-journey:bootstrap` once PostgreSQL, Convex, and Keycloak are healthy so the shared schema is applied and the local Keycloak smoke user is ready for backend-owned subscriber-journey validation.

The Compose baseline now includes a `postgres-bootstrap` one-shot service that creates dedicated local databases for the Postgres-backed infrastructure dependencies. This keeps the current one-host developer footprint small without mixing vendor-owned tables and migrations into the platform database.

Convex follows the upstream self-hosted Postgres contract: `CONVEX_POSTGRES_URL` must point at the Postgres cluster without a database path, and the actual Convex database name is derived from `CONVEX_INSTANCE_NAME` by replacing `-` with `_`. With the default local values, `comvestec-foundation` maps to the dedicated `comvestec_foundation` database.

There is not yet a single bootstrap script for every generated value. Today the repo relies on service-specific setup flows and runbooks for items such as the Convex admin key, GlitchTip DSN, Postal API key, Novu API key, OpenPanel client id, and the hardened-profile Vault bootstrap artifacts.

## Common Commands

Start the current full local platform footprint:

```bash
docker compose --env-file .env -f ops/docker/compose.yml up -d
```

Re-run the Postgres database bootstrap and recreate the affected services after pulling a change that updates service database isolation:

```bash
docker compose --env-file .env -f ops/docker/compose.yml up -d --force-recreate postgres-bootstrap keycloak convex-backend ory-keto unleash openmeter glitchtip
```

Generate the local Convex admin key after `convex-backend` is healthy and write it back to `.env` as `CONVEX_SELF_HOSTED_ADMIN_KEY`:

```bash
docker compose --env-file .env -f ops/docker/compose.yml exec convex-backend ./generate_admin_key.sh
```

Sync the deployment-managed Convex worker env values from `.env` into the active deployment after generating the admin key or changing any of the worker-facing backend settings:

```bash
bun run convex:env:sync
```

This sync step only writes the deployment-managed worker values. Convex provides its own runtime system URLs inside functions, and the CLI uses the local shell configuration for the deployment URL and admin key.

Apply the shared PostgreSQL schema after the baseline is running:

```bash
bun run db:migrate
```

Apply the shared PostgreSQL schema and provision the Keycloak smoke user for the backend subscriber-journey slice:

```bash
bun run backend:subscriber-journey:bootstrap
```

Start the backend-owned subscriber-journey API:

```bash
bun run backend:subscriber-journey
```

Kick off the live Keycloak to Polar smoke path after a real `POLAR_ACCESS_TOKEN` is in `.env` and `POLAR_WEBHOOK_SECRET` has been copied from `polar listen http://127.0.0.1:3010/api/subscriber-journey/billing/webhooks/polar`:

```bash
bun run backend:subscriber-journey:live-smoke
```

Generate a new reviewable SQL migration after changing any table definition under [packages/modules/src/persistence/postgres/](../../packages/modules/src/persistence/postgres/):

```bash
bun run db:generate
```

Start only the analytics service group:

```bash
docker compose --env-file .env -f ops/docker/compose.yml up -d op-db op-kv op-ch op-api op-dashboard op-worker-a op-worker-b op-proxy
```

Start only the security service group:

```bash
docker compose --env-file .env -f ops/docker/compose.yml up -d kong vault
```

Render the final merged Compose model without starting containers:

```bash
docker compose --env-file .env -f ops/docker/compose.yml config --quiet
```

Stop everything that belongs to the repo-managed deployment surface:

```bash
docker compose --env-file .env -f ops/docker/compose.yml down
```

## Profile Notes

- `analytics/` remains the concern-owned Compose file and runtime-asset folder for OpenPanel and its supporting services.
- `security/` remains the concern-owned Compose file and runtime-asset folder for Kong and Vault.
- Kong keeps the public proxy on `8000` and moves admin surfaces to `18001` and `18002` so the hardened profile can run beside GlitchTip on `8001`.
- Vault starts in normal server mode, not dev mode. Initialize and unseal it before treating it as ready.

## Runbooks

- [Backup And Restore Runbook](../../specs/04-ops/runbooks/backup-restore.md)
- [Config Rollback Runbook](../../specs/04-ops/runbooks/config-rollback.md)
- [Incident Response Runbook](../../specs/04-ops/runbooks/incident-response.md)
- [OpenPanel Self-Hosting Runbook](../../specs/04-ops/runbooks/openpanel-self-hosting.md)
- [Kong And Vault Bootstrap Runbook](../../specs/04-ops/runbooks/kong-vault-bootstrap.md)
- [Sensitive Access Review Runbook](../../specs/04-ops/runbooks/sensitive-access-review.md)
