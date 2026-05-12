# Local Secret And Operator Bootstrap Runbook

Use this runbook to bootstrap machine-local secrets, provision human operator access where the current local stack supports it, and keep tracked files free of reusable credentials.

## Scope

1. The checked-in `ops/docker/compose.yml` stack is the vendor-infrastructure baseline only.
2. The repository does not currently ship Dockerfiles for the first-party admin app, product app, public web, or a repo-owned backend container.
3. Tracked files such as `ops/docker/**/*.yml`, `.env.example`, and checked-in runtime assets must contain placeholders instead of working local secrets.

## Goals

1. Generate strong machine-local values in Vault before the first full-stack start.
2. Start the vendor-infrastructure stack without relying on checked-in placeholder values or a persistent repo-root `.env` for pre-start local secrets.
3. Provision named human operator logins where the current service supports them.
4. Store the resulting active credential bundle outside tracked files, with Vault as the local source of truth.

## Pre-Start Secret Bootstrap

1. Optionally create ignored `.env.local` with non-secret host overrides such as alternate ports or base URLs.
2. Do not store concrete values for placeholder-backed keys in `.env.local` or other ad hoc env files. Write them to Vault or pass them only for the current command.
3. Start Vault only.

   ```bash
   docker compose -f ops/docker/compose.yml up -d vault
   ```

4. Initialize, unseal, and enable the `platform/` KV mount by following [Kong And Vault Bootstrap Runbook](./kong-vault-bootstrap.md).
5. Run the local secret bootstrap command.

   ```bash
   bun run ops:secrets:bootstrap
   ```

   If a legacy repo-root `.env` still exists, this command now treats it as one-time migration input, copies placeholder-backed concrete secret values into Vault, and scrubs those secret lines from `.env` after a successful Vault write.

6. Confirm the bootstrap command wrote the placeholder-backed local-only values into Vault at `platform/local-ops/runtime-env` for items such as:
   - PostgreSQL passwords and derived DSNs
   - Keycloak bootstrap admin credentials and client secret
   - Grafana bootstrap admin credentials
   - Unleash backend API token
   - Meilisearch master key
   - Novu MongoDB password, JWT secret, store-encryption key, and local operator password
   - Postal MariaDB password, Rails secret key, signing-key seed, and local operator password
   - OpenMeter backend adapter API key
   - OpenPanel cookie secret, internal database credentials, and local operator password
   - GlitchTip secret key and local operator password
   - Unleash local operator username, email, and password

## Runtime Bootstrap

1. Start the current stack.

   ```bash
   bun run ops:docker:compose -- up -d
   ```

2. Run the repo-owned runtime bootstrap command after the messaging services are healthy:

   ```bash
   bun run ops:runtime:bootstrap
   ```

   This command provisions or reuses the current GlitchTip, OpenPanel, Postal,
   and Unleash local human operator logins, captures the Postal and Novu backend
   API keys, reconciles the repo-owned Unleash backend token when the live local
   DB drifts from Vault, provisions or reuses the repo-owned OpenPanel backend
   client credentials and the local GlitchTip project DSN, writes those values
   back to Vault, and temporarily recreates Novu with registration enabled only
   while the first operator is being seeded.

3. Capture any remaining runtime-only values that are still generated after
   services start, such as the Convex admin key, any stricter OpenMeter auth
   token you enable later, service-scoped API tokens, and service-specific
   human login credentials not yet covered by the repo-owned runtime bootstrap
   command.
4. Keep break-glass credentials separate from daily-use operator credentials.
5. Write the captured remaining runtime-only values back to Vault.

## Current Human-Login Expectation

Provision human operator access where supported by the current local stack:

1. Keycloak admin console
2. Grafana
3. GlitchTip
4. OpenPanel
5. Novu
6. Postal
7. Unleash

`bun run ops:runtime:bootstrap` now bootstraps the repo-owned human operator
login path for Keycloak, Grafana, GlitchTip, OpenPanel, Novu, Postal, and
Unleash. Novu now exposes its self-hosted dashboard on the repo-managed local
footprint and reuses the same Vault-backed `NOVU_EMAIL` / `NOVU_PASSWORD`
credentials that the runtime bootstrap path already provisions for the Novu
auth API. OpenMeter, Kong Manager, Meilisearch, and Ory Keto may still require
service-specific follow-up even though the backend readiness and adapter
boundaries now probe them through their real transport surfaces.

For the current direct host smoke surfaces, use these URLs after the stack is
up:

1. Grafana: `curl -f http://localhost:3001/api/health`
2. Loki: `curl -f http://localhost:3100/ready`
3. Tempo: `curl -f http://localhost:3200/ready`
4. OpenPanel API shell: `curl -f http://localhost:3005/api/healthcheck`
5. GlitchTip UI shell: open `http://localhost:8001/`
6. Novu dashboard UI shell: open `http://localhost:3103/`

## Vault Hand-Off

1. Treat Vault as the local operator hand-off store and runtime secret source of truth after it is initialized and unsealed.
2. Keep break-glass artifacts such as the Vault root token and unseal keys outside tracked files.
3. Prefer a read-only Vault token for day-to-day credential lookup over reusing the root token.

## Validation

1. `bun run ops:docker:validate-local`
2. `bun run ops:runtime:bootstrap`
3. `bun run ops:docker:validate-local -- --started-containers` after the full stack is up and the generated runtime secrets are present in Vault
4. `bun run format:check`
5. `bun run typecheck`
6. `bun run test`
