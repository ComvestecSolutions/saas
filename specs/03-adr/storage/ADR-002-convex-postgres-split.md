# ADR-002 Convex and PostgreSQL Split

Status: accepted

## Decision

Use Convex for interactive app state and file storage, and PostgreSQL for audit, config, permission overrides, billing, metering, and compliance-heavy workloads.

## Rationale

1. Preserves instant UX where it matters.
2. Keeps evidence-oriented and system-grade records in PostgreSQL.
3. Avoids forcing one store to serve conflicting workload patterns.
