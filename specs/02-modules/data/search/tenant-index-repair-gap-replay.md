# Search Tenant-Index Repair-Gap Replay

Status: accepted

## Purpose

Close the remaining replay-governance gap in `search` by explicitly binding replay of failed or blocked tenant-index ensure jobs to the shared `workflow-jobs` owner surface instead of a module-local Search route.

## Scope

1. Replay of persisted `searchIndexEnsure` repair-gap jobs through the shared workflow-jobs replay surface.
2. Reuse of the existing durable Search workflow payload for tenant target and stored settings while rebinding replay provenance to the current authorized operator context.
3. Search-specific replay constraints around authorization, feature gating, and state revalidation at execution time.

## Non-Goals

1. A Search-owned replay HTTP route.
2. A new Search workflow kind.
3. Caller-supplied replacement settings or tenant targeting during replay.
4. Replay for future Search workflow kinds that do not yet exist.

## Replay Rules

1. Search repair-gap replay stays on the shared workflow-jobs owner surface.
2. Replay eligibility comes from durable PostgreSQL workflow-job state rather than module-local in-memory state.
3. Replay must reuse the stored Search workflow payload for tenant scope, tenant scope id, and index settings, while replacing request provenance with the current authorized operator context so replay authorization and audit stay bound to the replayer.
4. Search must not accept ad hoc replacement settings or replacement tenant targeting when a repair gap is replayed.
5. Replay must execute the existing `searchIndexEnsure` worker path so the Search worker revalidates current authorization and `search.enabled` state before any index mutation runs.
6. Replay audit evidence remains owned by the workflow-jobs module, while Search keeps its own ensure and reindex request evidence on the originating operator surfaces.

## Authorization And Feature Rules

1. Replay requires the delegated authorization, break-glass checks, and identity-token validation already enforced by the workflow-jobs owner surface.
2. Search replay remains safe when state changes after the original failure because the replayed Search worker rechecks operator access and `search.enabled` before mutating the tenant index.
3. Search must not add a parallel module-local replay control that bypasses the shared workflow-jobs controls.

## Follow-Up Work

1. Add replay coverage for future Search workflow kinds only through accepted specs that continue to reuse the shared workflow-jobs surface.
2. Broaden Search into additional document families and relevance controls separately from the current managed-file replay path.
