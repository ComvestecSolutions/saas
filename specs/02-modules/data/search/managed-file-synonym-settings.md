# Search Managed-File Synonym Settings

Status: accepted

## Purpose

Close the first Search relevance-control gap by allowing managed-file tenant indexes to carry an optional durable synonym map through the existing ensure, stored-settings reindex, and shared replay paths.

## Scope

1. An optional synonym map on `SearchTenantIndexSettings` for the current managed-file summary document family.
2. Meilisearch settings updates that apply the durable synonym map when it exists.
3. Reuse of stored synonym settings during tenant-index ensure, stored-settings reindex, and shared workflow-jobs replay.

## Non-Goals

1. A dedicated Search synonym-mutation route.
2. Broader ranking-rule, typo-tolerance, or analyzer management APIs.
3. Additional searchable document families.
4. Caller-supplied synonym replacement during replay or stored-settings reindex.

## Synonym Rules

1. Synonyms are optional. Existing tenant-index records without synonyms remain valid, and an omitted synonym map is the authoritative no-synonyms state for subsequent ensure, reindex, and replay runs.
2. When provided, synonyms persist in the durable tenant-index settings record instead of an adapter-local or in-memory cache.
3. Search ensure applies the durable synonym map through the existing Meilisearch settings update path.
4. Stored-settings reindex and shared workflow-jobs replay must reuse the stored synonym map when it exists.
5. Search must not add a separate module-local synonym route before an accepted spec defines operator mutation and inspection behavior for broader relevance controls.

## Follow-Up Work

1. Add broader relevance controls only through accepted specs that keep Search settings durable and replay-safe.
2. Broaden Search into additional document families separately from the current managed-file synonym slice.
