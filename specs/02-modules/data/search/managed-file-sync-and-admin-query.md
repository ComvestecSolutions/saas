# Search Managed-File Sync And Admin Preview Query

Status: accepted

## Purpose

Close the first real searchable-content gap in `search` by making the existing tenant-index ensure workflow perform a full managed-file summary resync and by exposing an operator-only preview query route over that same tenant-scoped index.

## Scope

1. The first indexed document family is managed-file summaries from `file-storage`.
2. The existing tenant-index ensure path performs a full tenant resync for that document family instead of only creating index metadata.
3. Search exposes one backend-owned admin preview query route for authenticated operators.
4. Search query results return the approved managed-file summary projection rather than raw file-storage records.
5. The existing workflow-job-backed ensure flow remains the only long-running orchestration path for this slice.

## Non-Goals

1. Tenant-facing search routes or first-party app search UI.
2. Additional document families beyond managed-file summaries.
3. Synonym management, ranking-rule mutation, or broader relevance tuning APIs.
4. Incremental checkpoint-based sync or event-stream indexing.
5. New workflow kinds beyond the existing search tenant-index ensure workflow.

## Managed-File Source Boundary

1. Search consumes the existing managed-file summary projection from `file-storage`; it must not read raw blob metadata, storage ids, download URLs, classification values, or legal-hold state into the index.
2. The indexed document shape is limited to the file-summary fields that are already safe for delegated backend reads: `fileId`, `fileName`, `contentType`, `sizeBytes`, and optional `deletedAt`.
3. Search must not become an authoritative source of file state. `file-storage` remains the system of record.
4. Search must not call the file-storage HTTP transport. It consumes the shared backend boundary directly.

## Full-Resync Behavior

1. A tenant-index ensure operation first ensures the tenant index and its settings through the existing `search` module boundary.
2. After the index exists, Search loads the current managed-file summaries for the target tenant and performs a full document replacement for that tenant index.
3. Full replacement means stale managed-file documents are removed from the index when they are no longer present in the current managed-file summary list.
4. The durable search lifecycle record updates `documentCount` and `lastSyncedAt` from the completed replacement result.
5. Search may mark the lifecycle record as `failed` when document replacement fails after index creation, but it must preserve the durable error summary so operators can rerun the existing ensure workflow.

## Operator Preview Query

1. Search exposes one backend-owned admin preview query route for authenticated operator sessions.
2. Query authorization reuses the existing `search:admin` delegated authorization and target-tenant checks already used by the lifecycle routes.
3. Query results return only the approved managed-file summary projection and never raw file-storage records.
4. Preview query remains operator-only. No tenant-facing activation is implied by this slice.
5. Preview query remains available for operator inspection even when `search.enabled` is off, because disabling Search blocks tenant-visible activation but does not remove operator cleanup and inspection responsibilities.

## Audit And Security Rules

1. Preview query requests must append `search` audit evidence so operator data inspection is traceable.
2. Search indexes remain tenant-scoped. Cross-tenant inspection requires the same privileged break-glass path already used by the existing operator lifecycle routes.
3. Search must not index fields that would bypass `file-storage` ownership or field-classification rules.
4. Managed-file sync must not introduce internal HTTP hops or caller-supplied session spoofing.

## Follow-Up Work

1. Add additional document families only through accepted specs that define their approved source projection.
2. Add broader ranking and relevance management only after the first real query surface is stable.
3. Broaden replay and reindex workflows only after the current ensure path has proven a real content-sync loop.
