# Platform Package

This package contains backend-owned service boundaries and external adapter boundaries for the SaaS foundation.

Current package-owned surface:

- `src/adapters/`: concern-grouped adapters for identity, storage, messaging, observability, search, and billing or metering integrations
- `src/adapters/service-names.ts`: the shared adapter service-name vocabulary and healthcheck schema helper
- `src/http/`: standalone backend H3 request handler plus shared request-middleware for correlation, fail-open telemetry, OpenAPI JSON, and Swagger UI routes generated from Effect request and response schemas
- `src/services/platform-environment.ts`: validated runtime environment access
- `src/services/access/`: request-context transport and first-party auth boundaries
- `src/services/apps/`: app-facing snapshot and direct helper surfaces, with shared runtime-loader-backed dynamic imports for root-safe first-party app edges
- `src/services/communication/`: shared request-boundary and HTTP transport helpers plus backend-owned communication HTTP boundaries
- `src/services/domains/`: subscriber journey and billing domain services plus their HTTP adapters
- `src/services/governance/`: governance domain services and HTTP adapters
- `src/services/postgres-write-database.ts`: shared internal PostgreSQL write-database helper used by platform service slices

Transport ownership inside this package is explicit:

- First-party app transport follows `route or server function -> src/services/apps/*-actions.ts or snapshot helper -> shared service`.
- External transport follows `Request -> src/http/ or *-http.ts handler -> same shared service`.
- Shared workflow, authorization, field-security, reconciliation, persistence, and other reusable business logic belong in the shared service and module layers, not in either transport adapter.
- First-party callers should not import `*-http.ts` handlers just to reach shared behavior.

Supported package entrypoints are the root `src/index.ts` surface and `./http`; the folders above describe the internal organization that backs those exports rather than additional subpath exports.

Application shells should stay thin consumers of this package rather than reimplementing backend behavior in routes or UI code.

Adapter and service maturity is mixed across the package. Use [../../specs/00-governance/implementation-tracker.md](../../specs/00-governance/implementation-tracker.md) to check whether a capability is scaffolded, implemented, or validated.
