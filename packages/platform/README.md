# Platform Package

This package contains backend-owned service boundaries and external adapter boundaries for the SaaS foundation.

Current public surface:

- `src/adapters/`: concern-grouped adapters for identity, storage, messaging, observability, search, and billing or metering integrations
- `src/adapters/service-names.ts`: the shared adapter service-name vocabulary and healthcheck schema helper
- `src/http/`: standalone backend H3 request handler plus OpenAPI JSON and Swagger UI routes generated from Effect request and response schemas
- `src/services/platform-environment.ts`: validated runtime environment access
- `src/services/access/`: request-context transport and first-party auth boundaries
- `src/services/apps/`: app-facing snapshot and direct helper surfaces
- `src/services/communication/`: backend-owned communication HTTP boundaries
- `src/services/domains/`: subscriber journey and billing domain services plus their HTTP adapters
- `src/services/governance/`: governance domain services and HTTP adapters
- `src/services/postgres-write-database.ts`: shared internal PostgreSQL write-database helper used by platform service slices

Application shells should stay thin consumers of this package rather than reimplementing backend behavior in routes or UI code.

Adapter and service maturity is mixed across the package. Use [../../specs/00-governance/implementation-tracker.md](../../specs/00-governance/implementation-tracker.md) to check whether a capability is scaffolded, implemented, or validated.
