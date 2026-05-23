# Local Secret And Operator Bootstrap Runbook

Status: accepted

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

## Canonical Vault Artifacts

Keep the local Vault bootstrap and recovery files in these operator-local paths:

1. `~/.vault-init.json` — full `vault operator init` output
2. `~/.vault-unseal-key` — local unseal key share
3. `~/.vault-token` — break-glass root/bootstrap token
4. `~/.vault-local-runtime-token` — scoped non-root token for routine repo-owned
   reads and writes to `platform/local-ops/runtime-env`

For one-off bootstrap or recovery commands, repo-owned tooling also accepts
`VAULT_BOOTSTRAP_TOKEN` or `VAULT_BOOTSTRAP_TOKEN_FILE` as explicit overrides
instead of reading `~/.vault-token`.

Do not treat temp files, copied shell output, or clipboard snippets as the
canonical recovery record.

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
   The same command also refreshes `~/.vault-local-runtime-token` so day-to-day
   repo-owned tooling does not need the root token.

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
   Novu, and Unleash local human operator logins, captures the Postal and Novu
   backend API keys, reconciles the repo-owned Unleash backend token when the
   live local DB drifts from Vault, reconciles every manifest-declared feature
   flag into the default Unleash project and development environment so backend
   rollout evaluation stops falling back to missing definitions, provisions or
   reuses the repo-owned OpenPanel backend client credentials with the live
   OpenPanel hash contract, verifies the repo-owned Postal sender domain that
   matches `PLATFORM_EMAIL_SENDER_FROM_EMAIL`, seeds the repo-owned Novu
   workflows used by the current backend billing-notification path, provisions
   or reuses the local GlitchTip project DSN, writes the generated runtime
   values back to Vault, and temporarily recreates Novu with registration
   enabled only while the first operator is being seeded.

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
auth API, while the same bootstrap path seeds the repo-owned workflows the
current backend notification-center slice triggers. Postal sender verification
also now lands in the repo-owned bootstrap path instead of a manual console
step. OpenMeter, Kong Manager, Meilisearch, and Ory Keto may still require
service-specific follow-up even though the backend readiness and adapter
boundaries now probe them through their real transport surfaces. OpenMeter is
still transport-ready rather than a backend-owned module capability.

For admin-app operator identities specifically, use the repo-owned Keycloak
provisioning command when you need a daily-use platform-operator login for the
governed admin-app sign-in handoff:

```bash
bun run ops:keycloak:provision-admin-operator:local -- --name "Operator Name" --email operator@example.com
```

The command provisions or updates the Keycloak user, stamps the
`platform-operator` actor-type claim, resets the password to either the
supplied `--password` or a generated one, verifies the resulting token shape,
seeds the shared local Ory Keto tuple baseline for the `actor-type:platform-operator`
subject over the currently shipped admin-app module surfaces, seeds the initial
`admin-owner` membership when the admin organization is still empty (or refreshes
that same bootstrap owner if the membership already matches the Keycloak
subject/email), and prints the sign-in URL plus execution-time credentials
without writing them to tracked files. Once the initial owner exists, add later
operators through the admin-app membership flow instead of rerunning this
bootstrap path for a different owner.

### Admin-organization invitation runtime

The admin-organization platform service (`admin-organization-http.ts`) requires
two additional operator-environment values that ship in `.env.example`:

- `ADMIN_ORGANIZATION_INVITATION_TTL_MINUTES` mirrors the manifest config key
  `adminOrganizationConfigKey.invitationTtlMinutes`. The value is decoded at
  the service boundary as a positive integer and there is no in-service
  fallback. Pick a window that matches the operator policy for invitation
  rotation (the bundled default is `4320` minutes / 72h).
- `NOVU_WORKFLOW_ID_ADMIN_ORGANIZATION_INVITATION` is the typed Novu workflow
  identifier consumed by the `AdminOrganizationNotificationGateway` when the
  service issues an invitation. The literal must match
  `novuWorkflowId.adminOrganizationInvitation` (`admin-organization.invitation`).
  Wire the workflow body and subject in the Novu console; the platform service
  only emits the `AdminInvitationNotificationPayloadSchema` envelope and lets
  Novu render the recipient-facing copy.

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
2. Keep break-glass artifacts such as `~/.vault-token` and `~/.vault-unseal-key`
   outside tracked files.
3. Prefer `~/.vault-local-runtime-token` for day-to-day repo-owned tooling over
   reusing the root token.
4. If Vault is reinitialized and local tooling starts failing with `403
Forbidden`, rerun `bun run ops:secrets:bootstrap` so the scoped token is
   recreated from `~/.vault-token` instead of hunting for old temp-file copies.
   When you need an explicit one-off override for that recovery step, use
   `VAULT_BOOTSTRAP_TOKEN` or `VAULT_BOOTSTRAP_TOKEN_FILE`. Routine runtime
   reads now fail closed instead of silently falling back to the root token.

## Validation

1. `bun run ops:docker:validate-local`
2. `bun run ops:runtime:bootstrap`
3. `bun run ops:docker:validate-local -- --started-containers` after the full stack is up and the generated runtime secrets are present in Vault
4. `bun run format:check`
5. `bun run typecheck`
6. `bun run test`
7. `bun run test:backend:e2e:local` when the local vendor stack is running and you want live backend-owned Unleash, GlitchTip, OpenPanel, Novu, and Postal smoke coverage
