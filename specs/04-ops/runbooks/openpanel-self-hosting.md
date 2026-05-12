# OpenPanel Self-Hosting Runbook

Status: accepted

## Scope

Use this runbook to deploy, verify, and wire the OpenPanel analytics services that back `OPENPANEL_API_URL`, `OPENPANEL_CLIENT_ID`, and `OPENPANEL_CLIENT_SECRET` for the Comvestec SaaS foundation.

The OpenPanel stack lives in the `ops/docker/analytics/` concern folder and starts through the main `ops/docker/compose.yml` entrypoint. The current runtime environment treats OpenPanel as a required platform dependency.

Use [../../00-governance/implementation-tracker.md](../../00-governance/implementation-tracker.md) to track current analytics and observability maturity. This runbook documents the operator path for the current repo-managed OpenPanel deployment; it does not imply that the full analytics workflow is already validated end to end.

## Minimum Expectations

1. Start OpenPanel through the main `ops/docker/compose.yml` entrypoint as part of the current full local platform footprint.
2. Keep `API_URL` on the public analytics host with a `/api` suffix, and keep `DASHBOARD_URL` on the same public host without the suffix.
3. Set `API_CORS_ORIGINS`, `DATABASE_URL`, `DATABASE_URL_DIRECT`, `REDIS_URL`, `CLICKHOUSE_URL`, and `COOKIE_SECRET` explicitly for every environment.
4. Verify the OpenPanel API healthcheck before wiring the foundation runtime to the deployment.
5. Treat `OPENPANEL_CLIENT_ID` and `OPENPANEL_CLIENT_SECRET` as bootstrap-generated values: the checked-in env example cannot know the real server-side client credentials before the first local project exists, and `bun run ops:runtime:bootstrap` is the repo-owned provisioning path for the local backend client.
6. Keep the repo-managed proxy in front of the dashboard and API so the local public host stays `http://localhost:3005` while the API remains available at `http://localhost:3005/api`.
7. Keep the dashboard container's loopback-only API forwarder enabled so server-side rendering can resolve `http://localhost:3005/api` inside the container without pointing browser traffic at an internal host.
8. Record the resulting `OPENPANEL_API_URL`, `OPENPANEL_CLIENT_ID`, and `OPENPANEL_CLIENT_SECRET` in the Vault-backed foundation environment after bootstrap; the local repo-owned path now writes the generated client credentials back to Vault automatically.

## Deployment Flow

1. Review the OpenPanel section in `.env.example` and optional non-secret overrides in `.env.local`.

   ```bash
    OPENPANEL_DASHBOARD_URL=http://localhost:3005
    OPENPANEL_API_URL=http://localhost:3005/api
     OPENPANEL_CLIENT_ID=generate-after-running-ops-runtime-bootstrap-or-supplying-managed-openpanel-client-id
     OPENPANEL_CLIENT_SECRET=generate-after-running-ops-runtime-bootstrap-or-supplying-managed-openpanel-client-secret
   ```

2. Confirm the local proxy and service settings:
   - `OPENPANEL_PORT=3005`
   - `OPENPANEL_DASHBOARD_URL=http://localhost:3005`
   - `OPENPANEL_API_URL=http://localhost:3005/api`
   - `OPENPANEL_API_CORS_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:3004`
   - `OPENPANEL_POSTGRES_USER=openpanel`
   - `OPENPANEL_POSTGRES_DB=openpanel`
   - `OPENPANEL_DATABASE_URL=postgresql://openpanel:<generated-openpanel-postgres-password>@op-db:5432/openpanel?schema=public`
   - `OPENPANEL_DATABASE_URL_DIRECT=postgresql://openpanel:<generated-openpanel-postgres-password>@op-db:5432/openpanel?schema=public`
   - `OPENPANEL_REDIS_URL=redis://op-kv:6379`
   - `OPENPANEL_CLICKHOUSE_URL=http://op-ch:8123/openpanel`
   - `OPENPANEL_COOKIE_SECRET=<generated-secret-or-local-secret>`

   The local secret bootstrap writes the OpenPanel PostgreSQL password and both derived database URLs into Vault at `platform/local-ops/runtime-env`; operators should treat the password placeholder above as bootstrap-generated rather than reusing the historical `postgres/postgres` defaults.

   Optional local email settings stay empty unless you are testing OpenPanel email delivery:
   - `OPENPANEL_EMAIL_SENDER=`
   - `OPENPANEL_RESEND_API_KEY=`

3. Start the OpenPanel service group.

   ```bash
   bun run ops:docker:compose -- up -d op-db op-kv op-ch op-api op-dashboard op-worker-a op-worker-b op-proxy
   ```

4. The local deployment exposes OpenPanel through the repo-managed proxy on one public host:
   - dashboard: `http://localhost:3005`
   - API: `http://localhost:3005/api`

5. The proxy lives in `ops/docker/analytics/Caddyfile` and routes `/api/*` to `op-api:3000` while routing all other traffic to `op-dashboard:3000`.
6. `op-dashboard` also starts `ops/docker/analytics/openpanel-local-api-proxy.js`, which binds `127.0.0.1:${OPENPANEL_PORT:-3005}` inside the dashboard container and forwards `/api/*` to `op-api:3000` so SSR uses the same public API URL contract as the browser.
7. Run `bun run ops:runtime:bootstrap` once the service group is up. The repo-owned bootstrap path now provisions or reuses the backend OpenPanel client in the local deployment, aligns the current organization membership when a user already exists, validates the authenticated `/api/track` boundary through the real adapter contract, and writes the resulting `OPENPANEL_CLIENT_ID` plus `OPENPANEL_CLIENT_SECRET` back to Vault.

## Verification

1. Check the container state.

   ```bash
   bun run ops:docker:compose -- ps op-db op-kv op-ch op-api op-dashboard op-worker-a op-worker-b op-proxy
   ```

   Once the full local stack is started and the generated secrets have been written to Vault, run the non-interactive started-container validation path too:

   ```bash
   bun run ops:docker:validate-local -- --started-containers
   ```

2. Confirm the core services are healthy:
   - `op-proxy`
   - `op-api`
   - `op-dashboard`
   - `op-worker-a`
   - `op-worker-b`
   - `op-db`
   - `op-kv`
   - `op-ch`

3. Verify the API health boundary from outside the stack.

   ```bash
   curl -f http://localhost:3005/api/healthcheck
   ```

4. Optionally open the dashboard URL and complete the first admin login if you also need human operator access. The backend bootstrap path does not depend on that dashboard workflow.

5. Confirm Vault now contains the generated `OPENPANEL_CLIENT_ID` and `OPENPANEL_CLIENT_SECRET` written by `bun run ops:runtime:bootstrap`. The backend readiness route probes the authenticated `/api/track` boundary with a malformed revenue-marked payload, so placeholder or rejected credentials keep readiness red until Vault contains the real values.

6. If either the API healthcheck or the runtime bootstrap validation fails while the proxy is up, inspect `op-api`, `op-dashboard`, `op-worker-a`, and `op-worker-b` logs first. The profile depends on successful PostgreSQL migrations plus healthy Redis and ClickHouse services before the dashboard becomes usable.

## Foundation Wiring

1. Set the foundation environment values:
   - `OPENPANEL_API_URL=http://localhost:3005/api`
   - `OPENPANEL_CLIENT_ID=<value-written-by-ops-runtime-bootstrap-or-managed-openpanel>`
   - `OPENPANEL_CLIENT_SECRET=<value-written-by-ops-runtime-bootstrap-or-managed-openpanel>`

2. Restart the Comvestec foundation services that read the shared environment.

3. Trigger a low-risk backend-owned analytics event from a non-production environment and confirm it arrives in the OpenPanel dashboard. Current repo-owned examples include operator preview queries in Search and export request or completion events in Import Export.
4. If readiness is still failing for OpenPanel after the API shell is green, re-check the Vault-backed `OPENPANEL_CLIENT_ID` and `OPENPANEL_CLIENT_SECRET` values first. The readiness probe now fails closed on missing or placeholder bootstrap credentials.

## Updates

1. Refresh the upstream checkout.

   ```bash
   bun run ops:docker:compose -- pull op-db op-kv op-ch op-api op-dashboard op-worker-a op-worker-b op-proxy
   ```

2. Restart the OpenPanel service group.

   ```bash
   bun run ops:docker:compose -- up -d op-db op-kv op-ch op-api op-dashboard op-worker-a op-worker-b op-proxy
   ```

3. Re-run the verification steps after every update.

4. If the OpenPanel image tag changes, update the matching technology-stack and deployment-profile specs in the same change so the pinned version and profile description stay aligned with `ops/docker/analytics/compose.yml`.
