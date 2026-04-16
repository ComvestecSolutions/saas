# ADR-017 Shared PostgreSQL Instance, Isolated Service Databases

Status: accepted

## Decision

Keep one repo-managed PostgreSQL engine in the default local Docker Compose baseline, but isolate the platform system-of-record database from service-owned databases.

Keycloak, Convex, Ory Keto, Unleash, OpenMeter, GlitchTip, and similar Postgres-backed dependencies may share the same local PostgreSQL container, but each service must use its own dedicated logical database instead of the platform database.

Local bootstrap automation may create these dedicated databases on startup, but database ownership remains per service boundary.

## Rationale

1. Preserves a small local operator footprint without collapsing service boundaries into one schema and migration domain.
2. Prevents third-party migrations, retention policies, and vendor-owned tables from polluting the platform system-of-record database.
3. Reduces blast radius when one dependency needs destructive maintenance, reset, or rebootstrap.
4. Keeps backup, restore, and inspection workflows clearer because platform-owned records stay separate from infrastructure-owned state.
5. Aligns the local baseline with the repository's broader data-ownership rules while staying pragmatic for one-host development and smoke environments.
