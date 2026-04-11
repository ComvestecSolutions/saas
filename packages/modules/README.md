# Modules Package

This workspace package holds reusable domain and platform module services for the SaaS foundation.

The initial implementation focuses on the cross-cutting scaffolds that make the accepted specs executable:

1. authorization and explainability
2. field-security projection enforcement
3. audit declaration and event capture
4. runtime-config resolution and change proposals
5. tenant-branding resolution and identity handoff
6. observability telemetry and SLO scaffolds
7. quota enforcement, cost allocation, break-glass, onboarding, and isolation checks

The package follows the manifests in [specs/02-modules/README.md](specs/02-modules/README.md).

Cross-module coordination stays inside declared module services and capability contracts rather than direct persistence access.

Source files are organized by concern so growth happens inside focused folders instead of a flat package root:

1. access
2. governance
3. domains
4. persistence
