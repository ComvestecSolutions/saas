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
- `messaging/compose.yml`: Novu API + worker + websocket + dashboard + MongoDB, plus Postal
- `metering/compose.yml`: OpenMeter API + sink worker, plus Kafka and ClickHouse
- `analytics/compose.yml`: OpenPanel services, plus the local analytics proxy and ClickHouse bootstrap assets
- `security/compose.yml`: Kong and Vault, plus the local security runtime assets

## Asset Folders

- `observability/`: observability compose file plus Grafana, Loki, OTel Collector, Prometheus, and Tempo runtime assets
- `identity/`: identity compose file plus the checked-in Keycloak realm export
- `analytics/`: OpenPanel compose file plus the local proxy and ClickHouse bootstrap assets
- `security/`: Kong and Vault compose file plus the DB-less Kong and Vault server config assets
- `feature-flags/`, `search/`, `metering/`: concern folders that currently hold only the included Compose files

## Environment Provenance

The checked-in `.env.example` mirrors the current runtime expectations and uses three value categories:

- `generated locally before first start`: generate the machine-local value with `bun run ops:secrets:bootstrap` after Vault is initialized and unsealed, for example bootstrap passwords, local operator passwords, client secrets, and symmetric service keys
- `generated during bootstrap`: capture or provision the value after the local service is running and write it back to Vault, for example `bun run ops:runtime:bootstrap` for the current Novu, Postal, OpenPanel, and GlitchTip backend credentials, or service-specific values such as the Convex admin key
- `external provider`: supply the value from a provider or operator-managed system outside the repo-local stack and prefer writing it to Vault, for example Polar credentials

Tracked files must not ship reusable local secrets, guessable bootstrap passwords, or working API tokens. The repository keeps placeholders only; the local operator stores the active secret bundle in Vault and may keep optional non-secret host overrides in ignored `.env.local`. Concrete values for placeholder-backed keys belong in Vault or one-off shell env only and are not part of the supported `.env.local` workflow.

## First Run

1. Optionally create ignored `.env.local` with non-secret host overrides such as alternate ports or base URLs.
2. Start Vault before the first secret bootstrap with `docker compose -f ops/docker/compose.yml up -d vault`.
3. Initialize, unseal, and enable the `platform/` KV mount by following [Kong And Vault Bootstrap Runbook](../../specs/04-ops/runbooks/kong-vault-bootstrap.md).
4. Run `bun run ops:secrets:bootstrap` so generated machine-local secrets such as PostgreSQL passwords, the Unleash backend API token, GlitchTip/OpenPanel/Postal/Unleash operator passwords, Novu runtime secrets, Postal bootstrap secrets, Meilisearch keys, and the local OpenMeter adapter key land in Vault at `platform/local-ops/runtime-env` instead of a persistent repo-root `.env` file.
   If a legacy `.env` still exists, the bootstrap command now treats it as one-time migration input and scrubs placeholder-backed concrete secret values from the file after writing them to Vault.
5. Start the current full local platform footprint with `bun run ops:docker:compose -- up -d`.
6. Run `bun run ops:runtime:bootstrap` after the messaging services are healthy so the repo-owned GlitchTip, Novu, OpenPanel, Postal, and Unleash human operator logins are provisioned or reconciled, the repo-owned Postal and Novu operator/API credentials are provisioned, the repo-owned Unleash backend token is reconciled when needed, the repo-owned Postal sender domain that matches `PLATFORM_EMAIL_SENDER_FROM_EMAIL` is verified, the repo-owned Novu workflows used by the current backend billing-notification path are seeded, the repo-owned OpenPanel backend client plus GlitchTip project DSN are provisioned or reused, and the resulting values are written back to Vault. Keep the raw GlitchTip project DSN form with its public key when possible, because backend document responses now derive a report-only browser security `report-uri` header from that DSN automatically; store-endpoint-only values still support uncaught-error capture but cannot advertise the browser security-report endpoint. Continue to use the remaining service-specific bootstrap flows for values such as the Convex admin key and any stricter OpenMeter auth token you later enable. OpenMeter remains transport-ready in the local stack, but it is not yet a backend-owned module capability. Until those generated values are stored in Vault, backend readiness intentionally stays degraded instead of reporting a fake green state.
7. After the Convex admin key is present in Vault, run `bun run convex:env:sync:local` whenever the deployment-managed worker values change so the active Convex deployment gets the current Postgres, Keycloak, Polar, Valkey, and Keto settings.
8. Use `bun run ops:docker:compose -- <docker compose args>` for service-specific `up`, `restart`, `logs`, or `ps` commands when you are intentionally troubleshooting a subset of the platform.
9. Run `bun run backend:subscriber-journey:bootstrap:local` once PostgreSQL, Convex, and Keycloak are healthy so the shared schema is applied and the local Keycloak smoke user is ready for backend-owned subscriber-journey validation.

`bun run ops:runtime:bootstrap` now also reconciles the repo-owned Unleash backend token when an existing local stack drifts from the current Vault-backed value.

The Compose baseline now includes a `postgres-bootstrap` one-shot service that creates dedicated local databases for the Postgres-backed infrastructure dependencies. This keeps the current one-host developer footprint small without mixing vendor-owned tables and migrations into the platform database.

Convex follows the upstream self-hosted Postgres contract: `CONVEX_POSTGRES_URL` must point at the Postgres cluster without a database path, and the actual Convex database name is derived from `CONVEX_INSTANCE_NAME` by replacing `-` with `_`. With the default local values, `comvestec-foundation` maps to the dedicated `comvestec_foundation` database.

The repo now ships `bun run ops:runtime:bootstrap` for the current backend-owned
messaging credentials, the repo-owned GlitchTip/Novu/OpenPanel/Postal/Unleash
human operator login paths, the local Unleash backend-token reconciliation
path, the OpenPanel backend client bootstrap path, the Postal sender-domain
reconciliation path, the repo-owned Novu workflow seeding path, and the
GlitchTip project DSN bootstrap path, so those integrations no longer depend on
ad hoc manual key capture after the stack starts. Other generated values still
rely on service-specific setup flows and runbooks, including the Convex admin
key, any stricter OpenMeter auth token you layer on top of the seeded backend
adapter key, and the hardened-profile Vault bootstrap artifacts. OpenMeter
itself remains transport-ready instead of a backend-owned metering capability.
Postal itself now boots through repo-owned config, database, and
schema-bootstrap containers instead of a success-shaped single container. Use
`bun run ops:local:command -- <command...>` when a local tool or CLI still
needs the Vault-backed runtime env but does not have its own `:local` package
script.

Operator-facing observability smoke surfaces remain directly available on the
host even though the backend readiness path only owns the OTLP, OpenPanel, and
GlitchTip adapter checks:

- Grafana: `curl -f http://localhost:3001/api/health`
- Loki: `curl -f http://localhost:3100/ready`
- Tempo: `curl -f http://localhost:3200/ready`
- OpenPanel API shell: `curl -f http://localhost:3005/api/healthcheck`
- GlitchTip UI shell: open `http://localhost:8001/`

Messaging operator-facing browser shells also remain directly available on the
host once the messaging group is healthy:

- Novu dashboard UI shell: open `http://localhost:3103/` and sign in with the Vault-backed `NOVU_EMAIL` / `NOVU_PASSWORD` pair

## Common Commands

Start the current full local platform footprint:

```bash
bun run ops:docker:compose -- up -d
```

Bootstrap the current repo-owned Postal and Novu runtime credentials and reconcile the local Unleash backend token after the messaging services are healthy:

```bash
bun run ops:runtime:bootstrap
```

Re-run the Postgres database bootstrap and recreate the affected services after pulling a change that updates service database isolation:

```bash
bun run ops:docker:compose -- up -d --force-recreate postgres-bootstrap keycloak convex-backend ory-keto unleash openmeter-kafka openmeter-clickhouse openmeter openmeter-sink-worker glitchtip
```

Generate the local Convex admin key after `convex-backend` is healthy and write it back to Vault as `CONVEX_SELF_HOSTED_ADMIN_KEY`:

```bash
bun run ops:docker:compose -- exec convex-backend ./generate_admin_key.sh
```

Sync the deployment-managed Convex worker env values from the Vault-backed local runtime environment into the active deployment after generating the admin key or changing any of the worker-facing backend settings:

```bash
bun run convex:env:sync:local
```

This sync step only writes the deployment-managed worker values. Convex provides its own runtime system URLs inside functions, and the CLI uses the local shell configuration for the deployment URL and admin key.

Apply the shared PostgreSQL schema after the baseline is running:

```bash
bun run db:migrate:local
```

Apply the shared PostgreSQL schema and provision the Keycloak smoke user for the backend subscriber-journey slice:

```bash
bun run backend:subscriber-journey:bootstrap:local
```

Start the backend-owned subscriber-journey API:

```bash
bun run backend:subscriber-journey:local
```

Kick off the live Keycloak to Polar smoke path after a real `POLAR_ACCESS_TOKEN` is in Vault and `POLAR_WEBHOOK_SECRET` has been copied from `polar listen http://127.0.0.1:3010/api/subscriber-journey/billing/webhooks/polar`:

```bash
bun run backend:subscriber-journey:live-smoke:local
```

Run the full backend readiness kickoff from one command after those same Polar values are configured. This bootstraps PostgreSQL and Keycloak, starts the backend-owned API, waits for the public plan route to respond, runs the live smoke kickoff, and then keeps the API alive for the hosted checkout return and webhook reconciliation. Stop it with `Ctrl+C` after verification:

```bash
bun run backend:subscriber-journey:ready:local
```

Generate a new reviewable SQL migration after changing any table definition under [packages/modules/src/persistence/postgres/](../../packages/modules/src/persistence/postgres/) against the Vault-backed local runtime environment:

```bash
bun run db:generate:local
```

Start only the analytics service group:

```bash
bun run ops:docker:compose -- up -d op-db op-kv op-ch op-api op-dashboard op-worker-a op-worker-b op-proxy
```

Start only the security service group:

```bash
bun run ops:docker:compose -- up -d kong vault
```

Start only the messaging and metering service groups:

```bash
bun run ops:docker:compose -- up -d novu-mongo novu novu-worker novu-ws novu-dashboard postal postal-worker openmeter-kafka openmeter-clickhouse openmeter openmeter-sink-worker
```

Render the final merged Compose model without starting containers:

```bash
bun run ops:docker:compose -- config --quiet
```

Validate the repo-managed local deployment surface, including the rendered Compose service inventory, concern-owned analytics and security groups, and published host-port conflicts before starting containers:

```bash
bun run ops:docker:validate-local
```

Validate the started-container state after the full stack is up and `bun run ops:runtime:bootstrap` has written the current messaging runtime credentials to Vault:

```bash
bun run ops:docker:validate-local -- --started-containers
```

Stop everything that belongs to the repo-managed deployment surface:

```bash
bun run ops:docker:compose -- down
```

## Profile Notes

- `analytics/` remains the concern-owned Compose file and runtime-asset folder for OpenPanel and its supporting services.
- `security/` remains the concern-owned Compose file and runtime-asset folder for Kong and Vault.
- The current Compose entrypoint groups vendor-managed infrastructure only. The three first-party apps and any future first-party backend container should use a separate project grouping when the repository begins shipping app Dockerfiles.
- Kong keeps the public proxy on `8000`, renders the current `SUBSCRIBER_JOURNEY_API_PORT` into its DB-less backend-api upstream, and moves admin surfaces to `18001` and `18002` so the hardened profile can run beside GlitchTip on `8001`.
- Vault starts in normal server mode, not dev mode. Initialize and unseal it before treating it as ready.

## Runbooks

- [Backup And Restore Runbook](../../specs/04-ops/runbooks/backup-restore.md)
- [Config Rollback Runbook](../../specs/04-ops/runbooks/config-rollback.md)
- [Incident Response Runbook](../../specs/04-ops/runbooks/incident-response.md)
- [Local Secret And Operator Bootstrap Runbook](../../specs/04-ops/runbooks/local-secret-and-operator-bootstrap.md)
- [OpenPanel Self-Hosting Runbook](../../specs/04-ops/runbooks/openpanel-self-hosting.md)
- [Kong And Vault Bootstrap Runbook](../../specs/04-ops/runbooks/kong-vault-bootstrap.md)
- [Sensitive Access Review Runbook](../../specs/04-ops/runbooks/sensitive-access-review.md)
