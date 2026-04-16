# OpenPanel Self-Hosting Runbook

Status: accepted

## Scope

Use this runbook to deploy, verify, and wire the OpenPanel analytics services that back `OPENPANEL_API_URL` and `OPENPANEL_CLIENT_ID` for the Comvestec SaaS foundation.

The OpenPanel stack lives in the `ops/docker/analytics/` concern folder and starts through the main `ops/docker/compose.yml` entrypoint. The current runtime environment treats OpenPanel as a required platform dependency.

Use [../../00-governance/implementation-tracker.md](../../00-governance/implementation-tracker.md) to track current analytics and observability maturity. This runbook documents the operator path for the current repo-managed OpenPanel deployment; it does not imply that the full analytics workflow is already validated end to end.

## Minimum Expectations

1. Start OpenPanel through the main `ops/docker/compose.yml` entrypoint as part of the current full local platform footprint.
2. Keep `API_URL` on the public analytics host with a `/api` suffix, and keep `DASHBOARD_URL` on the same public host without the suffix.
3. Set `API_CORS_ORIGINS`, `DATABASE_URL`, `DATABASE_URL_DIRECT`, `REDIS_URL`, `CLICKHOUSE_URL`, and `COOKIE_SECRET` explicitly for every environment.
4. Verify the OpenPanel API healthcheck and a dashboard login before wiring the foundation runtime to the deployment.
5. Treat `OPENPANEL_CLIENT_ID` as a bootstrap-generated value: the checked-in env example cannot know the real client id before the first local project exists.
6. Keep the repo-managed proxy in front of the dashboard and API so the local public host stays `http://localhost:3005` while the API remains available at `http://localhost:3005/api`.
7. Record the resulting `OPENPANEL_API_URL` and `OPENPANEL_CLIENT_ID` in the foundation environment after bootstrap.

## Deployment Flow

1. Review the OpenPanel section in the root `.env` or `.env.example` file.

   ```bash
   OPENPANEL_DASHBOARD_URL=http://localhost:3005
   OPENPANEL_API_URL=http://localhost:3005/api
   OPENPANEL_CLIENT_ID=generate-after-creating-local-openpanel-project
   ```

2. Confirm the local proxy and service settings:
   - `OPENPANEL_PORT=3005`
   - `OPENPANEL_DASHBOARD_URL=http://localhost:3005`
   - `OPENPANEL_API_URL=http://localhost:3005/api`
   - `OPENPANEL_API_CORS_ORIGINS=http://localhost:3000,http://localhost:3002,http://localhost:3004`
   - `OPENPANEL_DATABASE_URL=postgresql://postgres:postgres@op-db:5432/postgres?schema=public`
   - `OPENPANEL_DATABASE_URL_DIRECT=postgresql://postgres:postgres@op-db:5432/postgres?schema=public`
   - `OPENPANEL_REDIS_URL=redis://op-kv:6379`
   - `OPENPANEL_CLICKHOUSE_URL=http://op-ch:8123/openpanel`
   - `OPENPANEL_COOKIE_SECRET=<generated-secret-or-local-secret>`
   - `OPENPANEL_WORKER_REPLICAS=2`

   Optional local email settings stay empty unless you are testing OpenPanel email delivery:
   - `OPENPANEL_EMAIL_SENDER=`
   - `OPENPANEL_RESEND_API_KEY=`

3. Start the OpenPanel service group.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml up -d op-db op-kv op-ch op-api op-dashboard op-worker op-proxy
   ```

4. The local deployment exposes OpenPanel through the repo-managed proxy on one public host:
   - dashboard: `http://localhost:3005`
   - API: `http://localhost:3005/api`

5. The proxy lives in `ops/docker/analytics/Caddyfile` and routes `/api/*` to `op-api:3000` while routing all other traffic to `op-dashboard:3000`.

## Verification

1. Check the container state.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml ps op-db op-kv op-ch op-api op-dashboard op-worker op-proxy
   ```

2. Confirm the core services are healthy:
   - `op-proxy`
   - `op-api`
   - `op-dashboard`
   - `op-worker`
   - `op-db`
   - `op-kv`
   - `op-ch`

3. Verify the API health boundary from outside the stack.

   ```bash
   curl -f http://localhost:3005/api/healthcheck
   ```

4. Open the dashboard URL, complete the first admin login, and create the analytics project or client that the foundation will use.

5. Capture the client identifier created by OpenPanel and replace the bootstrap sentinel stored as `OPENPANEL_CLIENT_ID` in the foundation environment.

6. If the API healthcheck fails while the proxy is up, inspect `op-api`, `op-dashboard`, and `op-worker` logs first. The profile depends on successful PostgreSQL migrations plus healthy Redis and ClickHouse services before the dashboard becomes usable.

## Foundation Wiring

1. Set the foundation environment values:
   - `OPENPANEL_API_URL=http://localhost:3005/api`
   - `OPENPANEL_CLIENT_ID=<client-id-from-openpanel>`

2. Restart the Comvestec foundation services that read the shared environment.

3. Trigger a low-risk analytics event from a non-production environment and confirm it arrives in the OpenPanel dashboard.

## Updates

1. Refresh the upstream checkout.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml pull op-db op-kv op-ch op-api op-dashboard op-worker op-proxy
   ```

2. Restart the OpenPanel service group.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml up -d op-db op-kv op-ch op-api op-dashboard op-worker op-proxy
   ```

3. Re-run the verification steps after every update.

4. If the OpenPanel image tag changes, update the matching technology-stack and deployment-profile specs in the same change so the pinned version and profile description stay aligned with `ops/docker/analytics/compose.yml`.
