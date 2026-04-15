# OpenPanel Self-Hosting Runbook

Status: accepted

## Scope

Use this runbook to deploy, verify, and wire the optional OpenPanel analytics profile that backs `OPENPANEL_API_URL` and `OPENPANEL_CLIENT_ID` for the Comvestec SaaS foundation.

The OpenPanel stack lives in the optional `analytics` profile inside `ops/docker/compose.yml`, with the included profile definition and local runtime assets owned by `ops/docker/analytics/`, so it uses the same repository-managed deployment surface as the rest of the local platform without becoming part of the default baseline.

## Minimum Expectations

1. Start OpenPanel through the `analytics` profile in `ops/docker/compose.yml` when you want the repository-managed local deployment path.
2. Keep `API_URL` on the public analytics host with a `/api` suffix, and keep `DASHBOARD_URL` on the same public host without the suffix.
3. Set `DATABASE_URL`, `REDIS_URL`, `CLICKHOUSE_URL`, and `COOKIE_SECRET` explicitly for every environment.
4. Verify the OpenPanel API healthcheck and a dashboard login before wiring the foundation runtime to the deployment.
5. Treat `OPENPANEL_CLIENT_ID` as a bootstrap-generated value: the checked-in env example cannot know the real client id before the first local project exists.
6. Record the resulting `OPENPANEL_API_URL` and `OPENPANEL_CLIENT_ID` in the foundation environment after bootstrap.

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
   - `OPENPANEL_DATABASE_URL=postgresql://postgres:postgres@op-db:5432/postgres?schema=public`
   - `OPENPANEL_REDIS_URL=redis://op-kv:6379`
   - `OPENPANEL_CLICKHOUSE_URL=http://op-ch:8123/openpanel`
   - `OPENPANEL_COOKIE_SECRET=<generated-secret>`

3. Start the analytics profile.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml --profile analytics up -d
   ```

4. The local profile exposes OpenPanel through the repo-managed proxy on one public host:
   - dashboard: `http://localhost:3005`
   - API: `http://localhost:3005/api`

## Verification

1. Check the container state.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml --profile analytics ps
   ```

2. Confirm the core services are healthy:
   - `op-api`
   - `op-dashboard`
   - `op-worker`
   - `op-db` when bundled
   - `op-kv` when bundled
   - `op-ch` when bundled

3. Verify the API health boundary from outside the stack.

   ```bash
   curl -f http://localhost:3005/api/healthcheck
   ```

4. Open the dashboard URL, complete the first admin login, and create the analytics project or client that the foundation will use.

5. Capture the client identifier created by OpenPanel and replace the bootstrap sentinel stored as `OPENPANEL_CLIENT_ID` in the foundation environment.

## Foundation Wiring

1. Set the foundation environment values:
   - `OPENPANEL_API_URL=http://localhost:3005/api`
   - `OPENPANEL_CLIENT_ID=<client-id-from-openpanel>`

2. Restart the Comvestec foundation services that read the shared environment.

3. Trigger a low-risk analytics event from a non-production environment and confirm it arrives in the OpenPanel dashboard.

## Updates

1. Refresh the upstream checkout.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml --profile analytics pull
   ```

2. Restart the analytics profile.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml --profile analytics up -d
   ```

3. Re-run the verification steps after every update.
