# Modules Package

This workspace package holds reusable backend module services and persistence helpers for the SaaS foundation.

Accepted module manifests live in [../../specs/02-modules/README.md](../../specs/02-modules/README.md) and describe the approved capability catalog. The current module rows in [../../specs/00-governance/implementation-tracker.md](../../specs/00-governance/implementation-tracker.md) are validated, and the tracker remains the live source of truth for future maturity changes.

Current code is organized by concern so growth happens inside focused folders instead of a flat package root:

- `access/`: authorization, field security, identity-session support, and related access helpers
- `governance/`: audit-log, runtime-config, support-operations, and adjacent governance scaffolds
- `domains/`: tenant management, tenant branding, observability, billing or metering flows, and adjacent domain services
- `persistence/`: PostgreSQL schema and repository helpers for the current backend slices

Cross-module coordination stays inside declared module services and capability contracts rather than direct persistence access.

Future module additions or follow-on capability work should stay tracked in the implementation tracker rather than being implied or hidden in package prose.
