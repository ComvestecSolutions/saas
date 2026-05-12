# Tenant Search Managed-File Query

Status: accepted

## Purpose

Close the next tenant-facing breadth gap in `search` by exposing a backend-owned managed-file summary query route for authenticated tenant sessions over the existing tenant-scoped index, without reintroducing caller-supplied tenant targeting, raw file-storage reads, or admin-only transport assumptions.

## Scope

1. One backend-owned tenant-session query route for the existing managed-file summary search document family.
2. Session-derived tenant targeting only; the request payload does not carry `scope` or `scopeId`.
3. Reuse of the existing tenant index and the existing `search` module query boundary.
4. Audit evidence for tenant-session search execution.
5. `search.enabled` gating for tenant-visible query access.

## Non-Goals

1. New searchable document families.
2. Anonymous search.
3. Synonym, ranking-rule, or other relevance-management APIs.
4. First-party UI work.
5. Cross-tenant query by operators through this route.

## Access Model

1. The route requires an authenticated session with a non-platform tenant context.
2. The target tenant is always the current session tenant. Callers must not supply an explicit tenant target.
3. Anonymous requests are denied.
4. `search.enabled` must gate this tenant-visible query path for the resolved tenant context.
5. Operator preview and cross-tenant inspection remain on the existing admin route with `search:admin` authorization.

## Query Boundary

1. The request body includes only the free-text query string and an optional limit.
2. Search continues to query the tenant-scoped index name derived from the authenticated session tenant.
3. The response reuses the approved managed-file summary projection already accepted for Search.
4. Search must not call file-storage HTTP transport or read raw file-storage records in this route.
5. The route must not introduce internal HTTP hops.

## Audit And Projection Rules

1. Tenant-session query execution appends `search` audit evidence distinct from operator preview-query audit evidence.
2. The response stays limited to the approved managed-file summary fields: `fileId`, `fileName`, `contentType`, `sizeBytes`, and optional `deletedAt`.
3. The route must not surface regulated-sensitive, secret, or raw storage fields.

## Follow-Up Work

1. Add additional tenant-facing document families only through accepted specs that define their approved source projections.
2. Add richer tenant-facing search capabilities such as facets or saved queries only after the first tenant query surface is stable.
3. Keep operator preview, reindex, and future replay workflows on their existing backend-owned admin surfaces.
