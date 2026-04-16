# Modules Package

This workspace package holds reusable backend module services and persistence helpers for the SaaS foundation.

Accepted module manifests live in [../../specs/02-modules/README.md](../../specs/02-modules/README.md) and describe the approved capability catalog. This package does not yet implement every accepted module in code. Use [../../specs/00-governance/implementation-tracker.md](../../specs/00-governance/implementation-tracker.md) for the current maturity of each module.

Current code is organized by concern so growth happens inside focused folders instead of a flat package root:

- `access/`: authorization, field security, identity-session support, and related access helpers
- `governance/`: audit-log, runtime-config, support-operations, and adjacent governance scaffolds
- `domains/`: tenant management, tenant branding, observability, billing or metering flows, and adjacent domain services
- `persistence/`: PostgreSQL schema and repository helpers for the current backend slices

Cross-module coordination stays inside declared module services and capability contracts rather than direct persistence access.

Some accepted modules are still manifest-only until their owning service, persistence, audit, and operator workflows land. That gap is intentional and tracked in the implementation tracker rather than hidden in package prose.
