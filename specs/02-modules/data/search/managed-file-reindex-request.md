# Search Managed-File Reindex Request

Status: accepted

## Purpose

Close the next operator-control gap in `search` by exposing a backend-owned reindex request route that reuses the existing tenant-index ensure workflow over the stored managed-file summary settings for the target tenant.

## Scope

1. One operator-only reindex request route for the existing managed-file summary document family.
2. Reuse of the existing `searchIndexEnsure` workflow job kind and dispatch path.
3. Reuse of the durable search tenant-index record as the source of truth for the current index settings.
4. Distinct audit evidence for operator-initiated reindex requests.

## Non-Goals

1. A new workflow kind.
2. Caller-supplied replacement settings on the reindex route.
3. Additional searchable document families.
4. Tenant-facing reindex controls.
5. Module-local replay controls outside the shared workflow-jobs surface.

## Reindex Rules

1. Reindex is an operator-only background request over the existing tenant-index ensure workflow.
2. The reindex route takes only the tenant target and optional schedule time.
3. Search loads the durable tenant-index record and reuses its stored settings for the scheduled workflow payload.
4. If the tenant-index record is missing or already deleted, the route fails with a not-found outcome rather than silently creating a new index.
5. If the tenant-index record exists but has no stored settings, the route fails rather than accepting ad hoc caller-supplied settings.
6. Operators that need to create a new index or replace settings continue to use the existing ensure request route.

## Authorization And Feature Rules

1. Reindex requires the same delegated `search:admin` authorization and break-glass checks already enforced by the existing operator lifecycle routes.
2. `search.enabled` must gate operator reindex requests for the target tenant, because reindex is an activation path rather than a stale-index cleanup path.
3. Reindex must append distinct `search` audit evidence so replayable background content rebuilds are traceable separately from generic ensure requests.

## Follow-Up Work

1. Add broader operator replay controls only through the shared workflow-jobs surface.
2. Add additional document families only through accepted specs that define their source projection and reindex behavior.
3. Add broader relevance management only after the stored-settings reindex path is stable.
