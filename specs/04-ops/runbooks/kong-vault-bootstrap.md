# Kong And Vault Bootstrap Runbook

Status: accepted

## Scope

Use this runbook to start, initialize, verify, and perform the minimum post-start bootstrap for the Kong and Vault services in `ops/docker/security/`.

The included hardened profile definition and local runtime assets are owned by `ops/docker/security/`, while `ops/docker/compose.yml` remains the only operator entrypoint.

The current platform footprint treats Kong and Vault as required edge and secrets dependencies rather than optional extras, and the main `ops/docker/compose.yml` entrypoint starts them by default.

The hardened profile provides:

1. Kong in DB-less mode for edge routing to the backend-owned HTTP API plus future gateway policy.
2. Vault in normal server mode for secrets management and operator-managed initialization.

## Minimum Expectations

1. Start Kong and Vault through the main `ops/docker/compose.yml` entrypoint as part of the current full local platform footprint.
2. Keep Kong public traffic on the proxy port and keep the admin surfaces on the dedicated high ports declared in `.env.example` or overridden non-secret values in `.env.local`.
3. Initialize Vault once per fresh `vault_data` volume and store the resulting unseal keys plus root token outside the repository.
4. Unseal Vault before any runtime or operator workflow depends on it.
5. Keep `ops/docker/security/kong.yml` routing `/api` to the host-run backend API on the current `SUBSCRIBER_JOURNEY_API_PORT`.

## Canonical Local Artifact Locations

Keep the local Vault recovery artifacts outside the repository and treat these
paths as the canonical source of truth:

1. `~/.vault-init.json` — full initialization output from `vault operator init`
2. `~/.vault-unseal-key` — the local unseal key share you use after restarts
3. `~/.vault-token` — the break-glass root/bootstrap token
4. `~/.vault-local-runtime-token` — the scoped non-root token used by repo-owned
   local tooling for routine reads and writes to `platform/local-ops/runtime-env`

For one-off bootstrap or recovery commands, repo-owned tooling also accepts
`VAULT_BOOTSTRAP_TOKEN` or `VAULT_BOOTSTRAP_TOKEN_FILE` as explicit overrides
instead of reading `~/.vault-token`.

Shell temp files, copied snippets, clipboard history, and ad hoc notes are not
the source of truth for local Vault recovery.

## Deployment Flow

1. Review the hardened profile values in `.env.example` and optional non-secret overrides in `.env.local`.

   ```bash
   KONG_PROXY_PORT=8000
   KONG_ADMIN_API_PORT=18001
   KONG_ADMIN_GUI_PORT=18002
   VAULT_ADDR=http://localhost:8200
   ```

2. Start Kong and Vault.

   ```bash
   docker compose -f ops/docker/compose.yml up -d kong vault
   ```

   Kong renders the current `SUBSCRIBER_JOURNEY_API_PORT` into its backend-api upstream when the container starts. The current local Vault profile keeps `disable_mlock = true` and sets `SKIP_SETCAP=1`, so the `hashicorp/vault:2.0.0` container stays compatible with Docker Desktop without carrying the extra Linux capability path that the image otherwise tries to configure at startup.

3. Confirm the services are up.

   ```bash
   docker compose -f ops/docker/compose.yml ps kong vault
   ```

## Vault Initialization And Unseal

1. Check the current Vault seal state.

   ```bash
   docker compose -f ops/docker/compose.yml exec vault vault status
   ```

2. On a fresh `vault_data` volume, initialize Vault once and capture the output
   to `~/.vault-init.json`.

   ```bash
   docker compose -f ops/docker/compose.yml exec vault vault operator init -format=json > ~/.vault-init.json
   ```

   Copy the root token from `~/.vault-init.json` to `~/.vault-token`, and copy
   one unseal key share to `~/.vault-unseal-key`.

3. Unseal Vault with the required number of unseal keys from the initialization
   output.

   ```bash
   docker compose -f ops/docker/compose.yml exec vault vault operator unseal <key-1>
   docker compose -f ops/docker/compose.yml exec vault vault operator unseal <key-2>
   docker compose -f ops/docker/compose.yml exec vault vault operator unseal <key-3>
   ```

4. Log in with the root token from initialization.

   ```bash
   docker compose -f ops/docker/compose.yml exec vault vault login <root-token>
   ```

5. Enable a minimal KV v2 mount for foundation-managed secrets.

   ```bash
   docker compose -f ops/docker/compose.yml exec vault vault secrets enable -path=platform kv-v2
   ```

6. Verify that the mount is usable.

   ```bash
   docker compose -f ops/docker/compose.yml exec vault vault kv put platform/example service=test
   docker compose -f ops/docker/compose.yml exec vault vault kv get platform/example
   ```

7. Bootstrap the Vault-backed local runtime env before starting the full stack.

   ```bash
   bun run ops:secrets:bootstrap
   ```

   This command also refreshes the scoped non-root local tooling token at
   `~/.vault-local-runtime-token`.

Do not commit initialization output, unseal keys, or root tokens to the repository.

## Kong Verification

1. Check the Kong Admin API from the host.

   ```bash
   curl -f http://localhost:18001
   ```

2. Start the backend-owned API in a separate terminal so Kong has a real upstream to proxy.

   ```bash
   bun run backend:subscriber-journey:local
   ```

3. Confirm the proxy forwards backend-owned traffic.

   ```bash
   curl -f http://localhost:8000/api/health
   curl -f http://localhost:8000/api/health/ready
   curl -f http://localhost:8000/api/openapi.json
   ```

4. Open Kong Manager in a browser.

   ```text
   http://localhost:18002
   ```

5. Treat `ops/docker/security/kong.yml` as the source of truth for the DB-less backend-api route. The container rewrites `__KONG_BACKEND_API_UPSTREAM_HOST__` and `__KONG_BACKEND_API_UPSTREAM_PORT__` from its runtime environment before Kong starts.

6. After changing `ops/docker/security/kong.yml` or `SUBSCRIBER_JOURNEY_API_PORT`, restart Kong to reload the rendered declarative configuration.

   ```bash
   bun run ops:docker:compose -- up -d kong
   ```

## Ongoing Operations

1. Re-check status after every restart.

   ```bash
   docker compose -f ops/docker/compose.yml exec vault vault status
   docker compose -f ops/docker/compose.yml ps kong vault
   ```

2. If Vault becomes sealed after a restart, repeat the unseal step with the
   stored `~/.vault-unseal-key` share.

3. If repo-owned local tooling starts returning `403 Forbidden` after Vault was
   reinitialized, the scoped token in `~/.vault-local-runtime-token` is stale.
   Re-run `bun run ops:secrets:bootstrap` so the scoped token is refreshed from
   the break-glass root token in `~/.vault-token`, or provide
   `VAULT_BOOTSTRAP_TOKEN` / `VAULT_BOOTSTRAP_TOKEN_FILE` explicitly for that
   recovery command. Repo-owned runtime reads now fail closed instead of
   silently reusing the root token.

4. If Kong routing changes, edit `ops/docker/security/kong.yml`, restart Kong,
   and re-check the Admin API plus the proxied backend API routes.
