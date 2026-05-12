# Tenant Search Lifecycle Design Slice

Status: working slice

Last updated: 2026-04-27

## Objective

Define the minimum governed backend slice required to move `search` beyond adapter-only scaffolding without violating tenant isolation, field-security projection rules, or the repository's durable-control-plane requirements.

## Scope

1. Tenant-scoped search index lifecycle over Meilisearch.
2. Durable search control-plane state for index ownership, sync progress, and operator-visible failures.
3. Field-security-safe document projection boundaries for indexed content.
4. Backend-owned operator controls for reindex, teardown, and lifecycle inspection.

## Non-Goals

1. Frontend search experiences or ranking-tuning UIs.
2. Broad relevance optimization beyond the initial tenant-safe lifecycle.
3. Replacing Meilisearch or introducing a second search engine.

## Ownership Model

1. Meilisearch stores searchable projections and tenant-specific index settings only.
2. PostgreSQL stores durable control-plane records: index ownership, sync checkpoints, reindex requests, failure history, and teardown evidence.
3. Convex-backed source modules remain the system of record for live domain data; search never becomes an authoritative write path.
4. Search document creation must come from explicit projection builders that already honor field-security classifications. Raw domain records are not indexed directly.

## Required Runtime Slice

1. Contracts: add shared schemas for tenant search index records, index lifecycle commands, sync status views, and backend-owned operator request envelopes.
2. Adapter: expand the Meilisearch adapter with explicit create-index, configure-index, upsert-documents, delete-documents, search, and delete-index operations.
3. Module: add a `search` module that owns index naming, lifecycle invariants, sync checkpoint progression, and typed search-specific errors.
4. Persistence: add PostgreSQL-backed search repositories for durable lifecycle state and operator-triggered reindex workflow requests.
5. Services: add a shared backend service plus backend-owned HTTP adapters for operator lifecycle actions before adding broader query consumers.
6. Workflows: reuse the workflow-jobs pattern for reindex or replay operations rather than embedding long-running synchronization inside request handlers.

## Security And Isolation Rules

1. Every search index is tenant-scoped. Shared global indexes are out of scope.
2. Search queries and lifecycle commands must resolve authorization against the caller's real session context; the target tenant must not be used as a spoofed subject.
3. Indexed document payloads must be built from approved projection descriptors so regulated-sensitive and secret fields never enter Meilisearch unless a future accepted spec explicitly permits and audits that path.
4. Tenant teardown must delete the tenant index through the search module and emit durable audit evidence.
5. Operator-initiated reindex and teardown actions must be auditable and replayable from PostgreSQL-backed state.
6. Disabling `search.enabled` stops tenant-visible activation of Search, but operator lifecycle inspection and teardown remain available for cleanup, audit, and stale-index removal.

## Implementation Order

1. Add contracts and module-persistence spec notes for the durable search control plane.
2. Expand the Meilisearch adapter behind typed Effect interfaces and healthcheck coverage.
3. Implement the search module plus PostgreSQL repositories for tenant index lifecycle state.
4. Add backend-owned operator HTTP routes and OpenAPI documentation for lifecycle inspection, reindex, and teardown.
5. Add targeted tests for tenant isolation, field-security-safe projection input, index teardown auditability, and workflow-driven reindex recovery.

## Validation Bar

1. Module tests must cover tenant isolation, typed lifecycle errors, durable failure recovery, and teardown audit evidence.
2. Platform tests must cover the shared search service and backend-owned HTTP lifecycle routes.
3. Repository-wide validation remains `bun run format:check`, `bun run typecheck`, and `bun run test` before the tracker can move beyond `implemented`.
4. Promotion to `validated` also requires a `SaaS Foundation Steward` pass on the completed search slice.
