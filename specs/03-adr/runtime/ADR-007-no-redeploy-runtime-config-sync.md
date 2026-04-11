# ADR-007 No-Redeploy Runtime Config Sync

Status: accepted

## Decision

Use code-declared config registries and module manifests as the reviewed schema and default catalog, store effective runtime values and history in PostgreSQL, and synchronize the two bidirectionally through explicit sync services so config and flag changes can take effect without app redeploy when the schema already exists.

Bidirectional sync means:

1. code changes can seed, update, retire, or reconcile PostgreSQL-backed runtime records
2. approved runtime changes in PostgreSQL can be pulled back into code-managed registries or exported as reviewable code changes for agents and humans
3. schema, ownership, and retirement rules remain reviewable in code and are not silently overwritten by database state
4. code-to-database promotion only happens from committed code changes; the committed code change is the code-side approval artifact
5. database-side runtime changes require an authenticated user with the proper permission scope and an auditable actor identity

## Rationale

1. Keeps runtime behavior operable without rebuild or redeploy for ordinary config and rollout changes.
2. Preserves code reviewability and agent-friendly edits for schemas, defaults, ownership, and retirement rules while still allowing operations-driven runtime changes.
3. Keeps approvals, audit evidence, tenant-scoped effective state, and rollback history in PostgreSQL.
4. Makes drift between code declarations and database state observable and recoverable in both directions.

## Operational Semantics

1. Operator-approved runtime overrides win over unchanged code defaults during normal resolution.
2. A committed code change updates the declared baseline; it does not silently delete runtime overrides unless the change explicitly retires or migrates the key.
3. Renamed keys require explicit migration metadata so the sync service can emit rename proposals instead of orphaning records.
4. Code-to-database sync may run during deploy, CI validation, or operator-invoked reconciliation, but it must be idempotent.
5. Database-to-code sync emits structured change proposal artifacts for review instead of mutating source files directly.
6. Partial sync failure must surface per-module status and preserve successful module sync history rather than pretending the entire pass was atomic.
