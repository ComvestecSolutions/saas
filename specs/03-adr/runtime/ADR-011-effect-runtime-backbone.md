# ADR-011 Effect as Runtime Backbone

Status: accepted

## Decision

Use Effect as the shared runtime backbone for services, schemas, error channels, layers, and environment modeling across all first-party platform code.

## Rationale

1. Structured concurrency, typed errors, and dependency injection via layers replace ad-hoc async helpers and manual DI.
2. Effect Schema provides a single source of truth from which exported TypeScript types are derived, enforcing the platform's "no duplicate interface-only models" rule.
3. `Redacted` values keep secrets out of logs and serialization without custom wrappers.
4. The layer-based composition model maps directly onto the adapter pattern used for every infrastructure service.
5. Keeps TanStack Start routes as thin framework edges that call `Effect.runPromise` at the boundary.

## Consequences

1. Live runtime functions that decode input with `Schema.decodeUnknown` keep the concrete parse error type instead of widening the error channel to `unknown`.
2. Runtime-facing configuration and identifiers that must never be empty use `Schema.NonEmptyString` at the boundary.
3. Platform adapters stay focused on translation, validation, and health concerns; policy and cross-boundary orchestration belong in modules and services.
4. In-memory state in first-party runtime code is limited to bounded cache-like concerns and local scaffolds, never durable governance source-of-truth workflows.
