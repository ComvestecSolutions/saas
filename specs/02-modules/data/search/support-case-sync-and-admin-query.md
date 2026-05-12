# Search Support-Case Sync And Admin Preview Query

Status: accepted

## Purpose

Broaden `search` beyond the first managed-file summary family by indexing support-safe support-case records in the same tenant-scoped Meilisearch index and by exposing operator-only preview filters and sorting that exercise the durable relevance settings already stored on the tenant index.

## Scope

1. A second indexed document family for support-case summaries sourced from the validated `support-operations` durable support-case record boundary.
2. Full tenant-index ensure and stored-settings reindex continue to resync the current managed-file summary family and now also resync the current support-case family.
3. Search stores a document-family discriminator so one tenant index can safely contain multiple approved families without caller-supplied cross-tenant scope.
4. Search exposes one backend-owned admin preview query route for support-case results.
5. The support-case admin preview route supports optional status and priority filters plus timestamp sorting over approved support-safe fields.

## Non-Goals

1. A tenant-facing support-case search route.
2. New support-operations HTTP routes or UI work.
3. Raw support-case record indexing beyond the approved support-safe fields.
4. Dedicated ranking-rule or typo-tolerance mutation routes separate from tenant-index ensure and stored-settings reindex.
5. Per-document-family indexes or new Search lifecycle tables.

## Support-Case Source Boundary

1. Search consumes tenant-scoped support-case summaries from the validated `support-operations` durable support-case repository boundary; it must not read impersonation-session records, break-glass incidents, approval reasons, or other non-support-case support-operations state into the index.
2. The indexed support-case shape is limited to the support-safe fields already approved for operator reads: `caseId`, `supportAgent`, `tenantScope`, `tenantScopeId`, `summary`, `status`, `priority`, `startedAt`, and `lastUpdatedAt`.
3. Search must not call the support-operations HTTP transport. It consumes the shared backend boundary directly.
4. `support-operations` remains the source of truth for support-case state. Search stores only searchable projections.

## Multi-Family Tenant Index Rules

1. Search keeps one durable tenant index per tenant target and stores a required `documentFamily` discriminator on every indexed document.
2. Managed-file preview and current-tenant managed-file query behavior must remain limited to the managed-file family even after support-case documents are added to the same tenant index.
3. Support-case preview results must remain limited to the support-case family and return only the approved support-safe fields.
4. Full replacement during ensure and stored-settings reindex replaces the full multi-family tenant document set so stale managed-file or support-case documents are removed when the current source projections no longer include them.
5. Search lifecycle summaries remain tenant-scoped and aggregate the total document count across all approved document families stored in the tenant index.

## Preview Query Relevance Controls

1. The support-case admin preview route is operator-only and reuses the existing `search:admin` delegated authorization and target-tenant checks.
2. The support-case admin preview request may include optional `status` and `priority` filter arrays and one optional timestamp sort over `startedAt` or `lastUpdatedAt`.
3. Search applies those preview filters and sort options through the Meilisearch query boundary rather than filtering results in memory after retrieval.
4. Durable tenant-index settings remain the source of truth for which support-case fields are filterable, sortable, searchable, and ranked; Search must not introduce adapter-local defaults that bypass stored settings.
5. The support-case preview route remains available for operator inspection even when `search.enabled` is off, because disabling Search blocks tenant-visible activation but does not remove operator inspection and cleanup responsibilities.

## Audit And Security Rules

1. Support-case preview queries must append `search` audit evidence so operator support-data inspection stays traceable.
2. Search indexes remain tenant-scoped. Cross-tenant inspection requires the same privileged break-glass path already used by the existing Search operator lifecycle routes.
3. Search must not index support-operations fields that would bypass the approved support-safe projection boundary.
4. Search preview filters and sorting must decode at the backend HTTP boundary before the shared Search service runs.

## Follow-Up Work

1. Add more document families only through accepted specs that define their approved source projection and operator or tenant query rules.
2. Add broader ranking-rule, typo-tolerance, or analyzer mutation only through accepted specs that keep Search settings durable and replay-safe.
3. Broaden tenant-facing query controls only after a future accepted spec defines which additional document families are safe for authenticated tenant search.
