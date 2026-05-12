# Backup and Restore Runbook

Status: accepted

## Scope

Use this runbook to capture and rehearse recovery for the platform system-of-record database, the service-owned PostgreSQL databases created by the main `postgres-bootstrap` flow, and the manually tracked volume-backed state that sits beside them.

This runbook does not yet provide a full concern-owned backup procedure for OpenPanel analytics history in `op-db` and `op-ch`; treat analytics data recovery as a separate gap until that concern gets its own validated workflow.

The current data-ownership baseline is:

- The platform system-of-record database lives in the shared `postgres` service as `${POSTGRES_DB:-comvestec}`.
- Service-owned databases such as Keycloak, Convex, Ory Keto, Unleash, OpenMeter, and GlitchTip share that PostgreSQL engine but stay in separate logical databases as described by ADR-017.
- Some services also keep state in Docker volumes, especially `convex_data`, `postal_data`, and observability upload or retention volumes.

## Minimum Expectations

1. Capture the platform database and each service-owned database separately.
1. Record which volume-backed data was in scope for the backup set.
1. Rehearse a restore into a non-production database before calling the backup strategy valid.
1. Preserve audit and runtime-config history as part of every restore check.

## Shared Postgres Backup

1. Confirm PostgreSQL is healthy from the main entrypoint.

```bash
docker compose --env-file .env -f ops/docker/compose.yml ps postgres
```

1. Dump the platform database.

```bash
mkdir -p backups
timestamp=$(date +%Y%m%d-%H%M%S)
docker compose --env-file .env -f ops/docker/compose.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-comvestec}" -d "${POSTGRES_DB:-comvestec}" -Fc \
  > "backups/platform-${timestamp}.dump"
```

1. Dump each repo-managed service database from the same engine. Derive the database names from the current env-backed settings so the commands stay aligned with non-default local or shared environments.

```bash
extract_database_name() {
  printf '%s' "$1" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#'
}
convex_database_name() {
  printf '%s' "$1" | tr '-' '_'
}
for database in \
  "$(convex_database_name "${CONVEX_INSTANCE_NAME:-comvestec-foundation}")" \
  "${KEYCLOAK_DB_NAME:-keycloak}" \
  "$(extract_database_name "${KETO_DSN:-postgres://comvestec:comvestec@postgres:5432/keto?sslmode=disable}")" \
  "$(extract_database_name "${UNLEASH_DATABASE_URL:-postgres://comvestec:comvestec@postgres:5432/unleash?sslmode=disable}")" \
  "$(extract_database_name "${OPENMETER_POSTGRES_URL:-postgres://comvestec:comvestec@postgres:5432/openmeter?sslmode=disable}")" \
  "$(extract_database_name "${GLITCHTIP_DATABASE_URL:-postgres://comvestec:comvestec@postgres:5432/glitchtip}")"; do
  docker compose --env-file .env -f ops/docker/compose.yml exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-comvestec}" -d "$database" -Fc \
    > "backups/${database}-${timestamp}.dump"
done
```

## Volume-Backed State

1. Capture non-Postgres state separately when it matters to the recovery target.
1. At minimum, evaluate `convex_data`, `vault_data`, `postal_data`, `glitchtip_uploads`, and observability volumes if retained metrics, logs, or traces matter to the drill.
1. The repository does not yet provide a single backup wrapper for Docker volumes. Use your standard Docker volume snapshot process and record exactly which volumes were captured.

## Restore Rehearsal

1. Create a temporary restore database.

```bash
restore_db="restore_check_${timestamp}"
docker compose --env-file .env -f ops/docker/compose.yml exec -T postgres \
  createdb -U "${POSTGRES_USER:-comvestec}" "$restore_db"
```

1. Restore the platform dump into that database.

```bash
cat "backups/platform-${timestamp}.dump" | \
  docker compose --env-file .env -f ops/docker/compose.yml exec -T postgres \
  pg_restore -U "${POSTGRES_USER:-comvestec}" -d "$restore_db" --clean --if-exists
```

1. Verify the archive is usable and the restored database opens cleanly.

```bash
docker compose --env-file .env -f ops/docker/compose.yml exec -T postgres \
  psql -U "${POSTGRES_USER:-comvestec}" -d "$restore_db" -c "\dt"
```

1. Rehearse the service-owned database dumps as well.

```bash
extract_database_name() {
  printf '%s' "$1" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#'
}
convex_database_name() {
  printf '%s' "$1" | tr '-' '_'
}
for database in \
  "$(convex_database_name "${CONVEX_INSTANCE_NAME:-comvestec-foundation}")" \
  "${KEYCLOAK_DB_NAME:-keycloak}" \
  "$(extract_database_name "${KETO_DSN:-postgres://comvestec:comvestec@postgres:5432/keto?sslmode=disable}")" \
  "$(extract_database_name "${UNLEASH_DATABASE_URL:-postgres://comvestec:comvestec@postgres:5432/unleash?sslmode=disable}")" \
  "$(extract_database_name "${OPENMETER_POSTGRES_URL:-postgres://comvestec:comvestec@postgres:5432/openmeter?sslmode=disable}")" \
  "$(extract_database_name "${GLITCHTIP_DATABASE_URL:-postgres://comvestec:comvestec@postgres:5432/glitchtip}")"; do
  service_restore_db="restore_${database}_${timestamp}"
  docker compose --env-file .env -f ops/docker/compose.yml exec -T postgres \
    createdb -U "${POSTGRES_USER:-comvestec}" "$service_restore_db"
  cat "backups/${database}-${timestamp}.dump" | \
    docker compose --env-file .env -f ops/docker/compose.yml exec -T postgres \
    pg_restore -U "${POSTGRES_USER:-comvestec}" -d "$service_restore_db" --clean --if-exists
  docker compose --env-file .env -f ops/docker/compose.yml exec -T postgres \
    psql -U "${POSTGRES_USER:-comvestec}" -d "$service_restore_db" -c "\dt"
  docker compose --env-file .env -f ops/docker/compose.yml exec -T postgres \
    dropdb -U "${POSTGRES_USER:-comvestec}" "$service_restore_db"
done
```

1. Validate operator-critical platform data, not just table presence. At minimum, confirm audit-log records and runtime-config artifacts can still be queried from the restored platform database before declaring the exercise successful.
1. Drop the rehearsal database when finished.

```bash
docker compose --env-file .env -f ops/docker/compose.yml exec -T postgres \
  dropdb -U "${POSTGRES_USER:-comvestec}" "$restore_db"
```

## Full Recovery Notes

1. Restore the platform database and service-owned databases independently unless the whole PostgreSQL engine was lost.
1. Do not restore third-party service databases into the platform database or merge schemas by hand.
1. If Convex or other volume-backed services were part of the loss event, restore their volumes before expecting the corresponding operator workflow to behave normally.
1. After a real restore, re-run the current verification surfaces: Compose health via `docker compose --env-file .env -f ops/docker/compose.yml ps`, backend API contract via `http://127.0.0.1:3010/api/docs`, and audit or runtime-config reads via the admin-governance endpoints.

## Current Gaps

1. There is not yet a repo-owned scheduled backup job or one-command recovery bundle.
1. OpenPanel analytics history in `op-db` and `op-ch` still needs a dedicated concern-owned backup and restore procedure.
1. Volume backup remains concern-specific and manual.
1. Recovery validation is still operator-driven; the repository does not yet ship an automated post-restore smoke suite that covers every dependency.
