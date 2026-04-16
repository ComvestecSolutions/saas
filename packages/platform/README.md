# Platform Package

This package contains backend-owned service boundaries and external adapter boundaries for the SaaS foundation.

Current public surface:

- `src/adapters/`: concern-grouped adapters for identity, storage, messaging, observability, search, and billing or metering integrations
- `src/adapters/service-names.ts`: the shared adapter service-name vocabulary and healthcheck schema helper
- `src/services/platform-environment.ts`: validated runtime environment access
- `src/services/app-snapshots.ts`: typed app bootstrap snapshot helpers
- `src/services/request-context-transport.ts`: request-context transport boundaries
- `src/services/subscriber-journey.ts` and `src/services/subscriber-journey-http.ts`: the current backend-owned subscriber journey slice

Application shells should stay thin consumers of this package rather than reimplementing backend behavior in routes or UI code.

Adapter and service maturity is mixed across the package. Use [../../specs/00-governance/implementation-tracker.md](../../specs/00-governance/implementation-tracker.md) to check whether a capability is scaffolded, implemented, or validated.
