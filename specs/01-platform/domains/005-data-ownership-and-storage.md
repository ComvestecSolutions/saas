# 005 Data Ownership and Storage

Status: accepted

## Convex Responsibilities

1. Interactive product state.
2. Real-time collaborative views.
3. Reactive read models.
4. File storage and file metadata used by the product experience.
5. Published branding assets and branding file metadata served through `file-storage`.

## PostgreSQL Responsibilities

1. Audit logs.
2. Effective runtime config, config history, and sync metadata.
3. Permission overrides and policy metadata.
4. Billing, subscriptions, and metering support.
5. Compliance evidence and retention metadata.
6. Reporting and export-support data.
7. Custom-domain verification state, sender identity metadata, and tenant-branding approval history.

All PostgreSQL access uses Drizzle as the ORM / query builder (ADR-010).

## Valkey Responsibilities

1. Session and token cache.
2. Rate-limit counters.
3. Ephemeral feature-flag evaluation cache.

## Meilisearch Responsibilities

1. Full-text search indexes for tenant-scoped data.
2. Faceted filtering and ranking.
3. Index lifecycle managed per-tenant through the search module adapter.

## Storage Rules

1. Do not introduce a second object storage product unless Convex storage proves insufficient for a documented requirement.
2. File access must still go through tenant, resource, and field-security rules.
3. File retention, deletion, and legal hold behavior must be spec-driven.
4. Public-safe branding assets may be published from Convex-backed storage, but unpublished asset references and verification metadata remain internal or secret.

## Integration Rules

1. Use explicit adapters or application services for cross-store synchronization.
2. Code-declared config registries and module manifests must synchronize bidirectionally with PostgreSQL-backed effective state through shared services, not direct UI writes.
3. Use outbox or event-forwarding patterns for durable coordination.
4. Do not couple UI code directly to database internals.
