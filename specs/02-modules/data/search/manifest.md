# Search Manifest

Status: accepted

## Technology Boundary

Meilisearch for full-text and faceted search. Index lifecycle is managed per-tenant through the search adapter, while the current accepted searchable document families are managed-file summaries sourced from the validated `file-storage` backend boundary and support-safe support-case summaries sourced from the validated `support-operations` durable support-case boundary. Convex-backed and PostgreSQL-backed source modules remain the system of record; Search stores searchable projections and tenant-scoped index settings only.

## Responsibilities

1. Full-text search across tenant-scoped data.
2. Index creation, update, teardown, and full-resync execution per tenant.
3. Faceted filtering and ranking configuration.
4. Search relevance tuning and synonym management.
5. Operator-safe preview query, stored-settings reindex request, shared workflow-jobs repair-gap replay, and current-tenant session query over approved searchable projections.
6. Multi-family tenant indexes with a required document-family discriminator for approved searchable projections.

## Permission Scopes

| Scope          | Description                                        |
| -------------- | -------------------------------------------------- |
| `search:admin` | Manage search indexes, synonyms, and ranking rules |

## Feature Flags

| Flag             | Purpose                                                                 | Billable | Default | Allowed Scopes |
| ---------------- | ----------------------------------------------------------------------- | -------- | ------- | -------------- |
| `search.enabled` | Gate tenant-visible search activation while preserving operator cleanup | No       | true    | platform       |

## Config Keys

| Key                         | Description                        | Default | Billable | Allowed Scopes       |
| --------------------------- | ---------------------------------- | ------- | -------- | -------------------- |
| `search.index.maxDocuments` | Maximum documents per tenant index | 100000  | No       | platform, enterprise |

## Data Classifications

The current accepted Search document families are managed-file summaries and support-safe support-case summaries. Search stores only the following approved projection fields for those slices:

### Managed-file summaries

| Field         | Classification |
| ------------- | -------------- |
| `fileId`      | `internal`     |
| `fileName`    | `internal`     |
| `contentType` | `internal`     |
| `sizeBytes`   | `internal`     |
| `deletedAt`   | `internal`     |

### Support-case summaries

| Field           | Classification |
| --------------- | -------------- |
| `caseId`        | `internal`     |
| `supportAgent`  | `internal`     |
| `tenantScope`   | `internal`     |
| `tenantScopeId` | `internal`     |
| `summary`       | `internal`     |
| `status`        | `internal`     |
| `priority`      | `internal`     |
| `startedAt`     | `internal`     |
| `lastUpdatedAt` | `internal`     |

## Projection Profiles

The current accepted Search projection profiles are the current-tenant managed-file query result, the operator managed-file preview query result, and the operator support-safe support-case preview query result:

| Profile        | Visible Fields                                                                                                          | Audited Fields |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------- |
| `summary`      | `fileId`, `fileName`, `contentType`, `sizeBytes`, `deletedAt`                                                           | None           |
| `admin`        | `fileId`, `fileName`, `contentType`, `sizeBytes`, `deletedAt`                                                           | None           |
| `support-safe` | `caseId`, `supportAgent`, `tenantScope`, `tenantScopeId`, `summary`, `status`, `priority`, `startedAt`, `lastUpdatedAt` | None           |

## Rules

1. Search indexes must be tenant-isolated.
2. Index content must reflect current field-security projections — no regulated-sensitive fields in search results without proper authorization.
3. Index teardown on tenant deletion must be explicit and auditable.
4. Disabling `search.enabled` blocks tenant-visible search activation and future tenant-facing query paths, but authenticated operator lifecycle inspection and teardown remain available so stale indexes can be audited and removed.
5. Searchable document families must come from approved source projections, not raw source-module records.
6. Operator preview query remains backend-owned and operator-only, while tenant-session managed-file query derives its tenant target from the authenticated session instead of caller-supplied scope fields.
7. Operator reindex requests must reuse the durable tenant-index settings already stored for the target tenant instead of accepting replacement settings on the reindex route.
8. Operator reindex requests treat missing or deleted durable tenant-index records as not found instead of implicitly recreating them.
9. Search repair-gap replay must stay on the shared workflow-jobs owner surface and reuse the stored workflow payload instead of adding a module-local replay route or caller-supplied replacement settings.
10. The first Search relevance-control slice stores optional managed-file synonym maps in durable tenant-index settings so ensure, stored-settings reindex, and shared replay apply the same synonym configuration.
11. Multi-family tenant indexes must store a required `documentFamily` discriminator on every indexed document so operator preview and tenant query routes stay family-scoped without separate tenant-index lifecycle records.
12. Support-case preview filtering and sorting must decode at the backend HTTP boundary and execute through the Meilisearch query boundary rather than filtering in memory after retrieval.
