# ADR-010 Drizzle ORM for PostgreSQL

Status: accepted

## Decision

Use Drizzle as the ORM / query builder for all PostgreSQL interactions (audit, config overrides, billing records, compliance data, metering events).

## Rationale

1. TypeScript-native schema definitions keep end-to-end type safety without code generation steps.
2. Lightweight runtime — no heavy reflection or metadata layer.
3. Works well with Effect-based service composition; queries can be wrapped in Effect pipelines.
4. Schema-first approach aligns with the platform rule that types derive from schemas.
