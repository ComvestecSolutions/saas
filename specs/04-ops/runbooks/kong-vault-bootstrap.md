# Kong And Vault Bootstrap Runbook

Status: accepted

## Scope

Use this runbook to start, initialize, verify, and perform the minimum post-start bootstrap for the Kong and Vault services in `ops/docker/security/`.

The included hardened profile definition and local runtime assets are owned by `ops/docker/security/`, while `ops/docker/compose.yml` remains the only operator entrypoint.

The current platform footprint treats Kong and Vault as required edge and secrets dependencies rather than optional extras, and the main `ops/docker/compose.yml` entrypoint starts them by default.

The hardened profile provides:

1. Kong in DB-less mode for edge routing and future gateway policy.
2. Vault in normal server mode for secrets management and operator-managed initialization.

## Minimum Expectations

1. Start Kong and Vault through the main `ops/docker/compose.yml` entrypoint as part of the current full local platform footprint.
2. Keep Kong public traffic on the proxy port and keep the admin surfaces on the dedicated high ports declared in `.env`.
3. Initialize Vault once per fresh `vault_data` volume and store the resulting unseal keys plus root token outside the repository.
4. Unseal Vault before any runtime or operator workflow depends on it.
5. Treat the checked-in Kong declarative config as a baseline stub until real services and routes are added.

## Deployment Flow

1. Review the hardened profile values in the root `.env` file.

   ```bash
   KONG_PROXY_PORT=8000
   KONG_ADMIN_API_PORT=18001
   KONG_ADMIN_GUI_PORT=18002
   VAULT_ADDR=http://localhost:8200
   ```

2. Start Kong and Vault.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml up -d kong vault
   ```

3. Confirm the services are up.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml ps kong vault
   ```

## Vault Initialization And Unseal

1. Check the current Vault seal state.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml exec vault vault status
   ```

2. On a fresh `vault_data` volume, initialize Vault once and capture the output securely.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml exec vault vault operator init
   ```

3. Unseal Vault with the required number of unseal keys from the initialization output.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml exec vault vault operator unseal <key-1>
   docker compose --env-file .env -f ops/docker/compose.yml exec vault vault operator unseal <key-2>
   docker compose --env-file .env -f ops/docker/compose.yml exec vault vault operator unseal <key-3>
   ```

4. Log in with the root token from initialization.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml exec vault vault login <root-token>
   ```

5. Enable a minimal KV v2 mount for foundation-managed secrets.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml exec vault vault secrets enable -path=platform kv-v2
   ```

6. Verify that the mount is usable.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml exec vault vault kv put platform/example service=test
   docker compose --env-file .env -f ops/docker/compose.yml exec vault vault kv get platform/example
   ```

Do not commit initialization output, unseal keys, or root tokens to the repository.

## Kong Verification

1. Check the Kong Admin API from the host.

   ```bash
   curl -f http://localhost:18001
   ```

2. Open Kong Manager in a browser.

   ```text
   http://localhost:18002
   ```

3. Treat `ops/docker/security/kong.yml` as the source of truth for the DB-less baseline. Add real services and routes there before expecting the proxy to forward production-like traffic.

4. After changing `ops/docker/security/kong.yml`, restart Kong to reload the declarative configuration.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml up -d kong
   ```

## Ongoing Operations

1. Re-check status after every restart.

   ```bash
   docker compose --env-file .env -f ops/docker/compose.yml exec vault vault status
   docker compose --env-file .env -f ops/docker/compose.yml ps kong vault
   ```

2. If Vault becomes sealed after a restart, repeat the unseal step with the stored keys.

3. If Kong routing changes, edit `ops/docker/security/kong.yml`, restart Kong, and re-check the Admin API plus intended proxy routes.
