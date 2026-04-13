# Implementation Tracker

Status: accepted

## Purpose

1. Provide a versioned delivery view next to the specs and ADRs.
2. Track whether each accepted area is documented, scaffolded, implemented, validated, or blocked.
3. Link tracker rows to the code, tests, and operator surfaces that justify the current status.

## Status Model

- `documented`: accepted spec or manifest exists, but there is no committed implementation path yet.
- `scaffolded`: a shell, baseline, or partial implementation exists, but the core runtime or operator workflow is incomplete.
- `implemented`: the primary behavior exists in code, but validation, admin surfaces, or runbooks are still incomplete.
- `validated`: implementation, docs, tests, and operator surfaces are aligned, and repository validation is green.
- `blocked`: waiting on a dependency or unresolved decision.

## Update Rules

1. Update this tracker in the same change as any material status shift.
2. Link every row to the governing spec and at least one evidence artifact.
3. Do not mark an area as `validated` unless `bun run typecheck` and `bun run test` are green for the current repository state.
4. Keep the `Next gap` column focused on the single most important missing capability.

## Foundation Quality Bar

1. Do not treat adapter presence, placeholder snapshots, or in-memory scaffolds as implementation completion.
2. A capability only moves beyond `scaffolded` when the owning module consumes the boundary behind shared contracts and its persistence, audit, and operator workflow responsibilities are explicit.
3. Governance-heavy flows such as config, approvals, audit, billing, entitlements, and compliance only move beyond `scaffolded` once durable PostgreSQL-backed state replaces in-memory source-of-truth behavior.
4. `validated` means boundary tests, repo-wide validation, and documentation all agree on the current operating model.

## Snapshot

Last updated: 2026-04-13

Roadmap: [Backend Readiness Roadmap](backend-readiness-roadmap.md)

### Current Pattern Priorities To Reach 10/10

1. Close the anonymous-to-entitled backend slice first: plan listing to auth start to auth callback to hosted checkout to webhook reconciliation to entitled product bootstrap.
2. Move runtime governance flows from in-memory scaffolds to PostgreSQL-backed system-of-record patterns.
3. Finish the adapter-to-module-to-operator workflow chain for authorization, observability, notifications, metering, and search.
4. Add integration validation once external-service wiring exists so platform adapters are more than typed stubs.

### Cross-Cutting Platform

#### Shared contracts and config baseline

- Governing spec: [006 Config, Permission, and Feature Governance](../01-platform/access/006-config-permission-and-feature-governance.md)
- Status: validated
- Evidence: [packages/contracts/src/access/index.ts](../../packages/contracts/src/access/index.ts), [packages/contracts/src/access/request-context.ts](../../packages/contracts/src/access/request-context.ts), [packages/config/src/defaults.ts](../../packages/config/src/defaults.ts), [packages/config/src/manifests/index.ts](../../packages/config/src/manifests/index.ts), [tests/contracts/](../../tests/contracts/)
- Next gap: Build database-backed effective config resolution instead of static seed data only.

#### No-redeploy runtime config sync

- Governing spec: [006](../01-platform/access/006-config-permission-and-feature-governance.md), [Runtime Config Manifest](../02-modules/governance/config-runtime/manifest.md), [ADR-007](../03-adr/runtime/ADR-007-no-redeploy-runtime-config-sync.md)
- Status: scaffolded
- Evidence: [packages/modules/src/governance/runtime-config.ts](../../packages/modules/src/governance/runtime-config.ts), [packages/modules/src/persistence/postgres/index.ts](../../packages/modules/src/persistence/postgres/index.ts), [tests/modules/governance.test.ts](../../tests/modules/governance.test.ts)
- Cleanup: runtime change proposals now ignore overrides owned by other modules so generated drift artifacts stay module-scoped and reviewable.
- Next gap: Replace in-memory proposal generation with PostgreSQL-backed sync history and approvals.

#### Observability baseline

- Governing spec: [008 Observability and Audit Baseline](../01-platform/security/008-observability-and-audit-baseline.md)
- Status: scaffolded
- Evidence: [ops/docker/compose.yml](../../ops/docker/compose.yml), [packages/platform/src/adapters/observability/observability.ts](../../packages/platform/src/adapters/observability/observability.ts), [packages/modules/src/domains/observability.ts](../../packages/modules/src/domains/observability.ts)
- Next gap: Add real telemetry emission and wire error events into GlitchTip.

#### Security and field-level data access

- Governing spec: [003](../01-platform/access/003-tenant-identity-and-access.md), [004](../01-platform/access/004-field-level-data-access.md)
- Status: scaffolded
- Evidence: [packages/contracts/src/access/request-context.ts](../../packages/contracts/src/access/request-context.ts), [packages/contracts/src/module-registry/modules.ts](../../packages/contracts/src/module-registry/modules.ts), [packages/modules/src/access/authorization.ts](../../packages/modules/src/access/authorization.ts), [packages/modules/src/access/field-security.ts](../../packages/modules/src/access/field-security.ts), [tests/modules/access.test.ts](../../tests/modules/access.test.ts)
- Security hardening: break-glass expiry validation enforced in authorization module; regulated-sensitive redaction enforced in field-security module; bounded authorization cache with expired-entry and oldest-entry eviction; environment schema uses `Schema.NonEmptyString` for all config fields; module manifests now declare field classifications through the same typed field vocabularies used by projection profiles; all source modules and tests use shared constants instead of raw vocabulary strings.
- Next gap: Replace in-memory tuple evaluation with Ory Keto-backed enforcement and request middleware.

#### Deployment baseline

- Governing spec: [010 Deployment Profiles](../01-platform/architecture/010-deployment-profiles.md), [013 Technology Stack](../01-platform/architecture/013-technology-stack.md)
- Status: scaffolded
- Evidence: [ops/docker/compose.yml](../../ops/docker/compose.yml)
- Next gap: Add environment-specific deployment automation and profile validation.

#### Technology catalog

- Governing spec: [013 Technology Stack](../01-platform/architecture/013-technology-stack.md)
- Status: scaffolded
- Evidence: [specs/01-platform/architecture/013-technology-stack.md](../01-platform/architecture/013-technology-stack.md), [packages/platform/src/index.ts](../../packages/platform/src/index.ts)
- Cleanup: platform adapter boundaries now enforce non-empty runtime-facing configuration and identifiers, preserve `ParseResult.ParseError` on decoded runtime inputs, bound the in-memory Valkey counter store and Ory Keto tuple store with `maxCacheSize`, and centralize adapter service names and healthcheck schemas in `packages/platform/src/adapters/service-names.ts`.
- Next gap: Complete adapter health probes and integration tests.

#### Security hygiene automation

- Governing spec: [010 Deployment Profiles](../01-platform/architecture/010-deployment-profiles.md), [013 Technology Stack](../01-platform/architecture/013-technology-stack.md)
- Status: implemented
- Evidence: [.github/workflows/security-hygiene.yml](../../.github/workflows/security-hygiene.yml), [.github/dependabot.yml](../../.github/dependabot.yml)
- Next gap: Add image digest pinning for first-party app images once app Dockerfiles exist.

### Architecture Decision Records

| ADR                                                                                                                                               | Status   | Evidence                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------- |
| [ADR-001 Modular Monolith](../03-adr/architecture/ADR-001-modular-monolith.md)                                                                    | accepted | Repository structure       |
| [ADR-002 Convex PostgreSQL Split](../03-adr/storage/ADR-002-convex-postgres-split.md)                                                             | accepted | Compose + adapters         |
| [ADR-003 Convex Storage First](../03-adr/storage/ADR-003-convex-storage-first.md)                                                                 | accepted | Compose                    |
| [ADR-004 Keycloak First Identity](../03-adr/identity/ADR-004-keycloak-first-identity.md)                                                          | accepted | Compose + adapter          |
| [ADR-005 Open Source Dependency Policy](../03-adr/architecture/ADR-005-open-source-dependency-policy.md)                                          | accepted | Tech stack spec            |
| [ADR-006 Instant App State Strategy](../03-adr/runtime/ADR-006-instant-app-state-strategy.md)                                                     | accepted | Convex adapter             |
| [ADR-007 No-Redeploy Runtime Config Sync](../03-adr/runtime/ADR-007-no-redeploy-runtime-config-sync.md)                                           | accepted | Config package             |
| [ADR-008 Ory Keto Authorization](../03-adr/identity/ADR-008-ory-keto-authz.md)                                                                    | accepted | Compose + adapter          |
| [ADR-009 Unleash Feature Flags](../03-adr/runtime/ADR-009-unleash-feature-flags.md)                                                               | accepted | Compose + adapter          |
| [ADR-010 Drizzle ORM](../03-adr/storage/ADR-010-drizzle-orm.md)                                                                                   | accepted | Referenced in specs        |
| [ADR-011 Effect Runtime Backbone](../03-adr/runtime/ADR-011-effect-runtime-backbone.md)                                                           | accepted | All platform packages      |
| [ADR-012 Postal Email Delivery](../03-adr/communication/ADR-012-postal-email-delivery.md)                                                         | accepted | Compose + adapter          |
| [ADR-013 Docker Hardened Images Policy](../03-adr/architecture/ADR-013-docker-hardened-images-policy.md)                                          | accepted | Docs + security CI         |
| [ADR-014 Tenant Branding Strategy](../03-adr/domains/ADR-014-tenant-branding-strategy.md)                                                         | accepted | White-label spec set       |
| [ADR-015 Convex Native Workflows And GlitchTip Error Tracking](../03-adr/domains/ADR-015-convex-native-workflows-and-glitchtip-error-tracking.md) | accepted | Specs + adapters + Compose |

### Applications

#### Public web

- Governing spec: [Public Web Spec](../02-apps/public-web/spec.md)
- Status: scaffolded
- Evidence: [apps/public-web/src/routes/index.tsx](../../apps/public-web/src/routes/index.tsx)
- Next gap: Replace the placeholder snapshot with public-safe plan listing, auth start, and hosted checkout handoff.

#### Product app

- Governing spec: [Product App Spec](../02-apps/product-app/spec.md)
- Status: scaffolded
- Evidence: [apps/product-app/src/routes/index.tsx](../../apps/product-app/src/routes/index.tsx)
- Next gap: Implement auth callback, entitlement bootstrap, and billing status endpoints beyond the shell snapshot.

#### Admin app

- Governing spec: [Admin App Spec](../02-apps/admin-app/spec.md)
- Status: scaffolded
- Evidence: [apps/admin-app/src/routes/index.tsx](../../apps/admin-app/src/routes/index.tsx)
- Next gap: Implement config sync, drift review, approvals, and audit mutation flows.

### Modules

#### Tenant management

- Governing manifest: [Manifest](../02-modules/domains/tenant-management/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/domains/tenant-management.ts](../../packages/modules/src/domains/tenant-management.ts), [tests/modules/domains.test.ts](../../tests/modules/domains.test.ts)
- Next gap: Replace onboarding and isolation scaffolds with durable tenant provisioning and onboarding state for the signup-to-entitled-access slice.

#### Runtime config

- Governing manifest: [Manifest](../02-modules/governance/config-runtime/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/governance/runtime-config.ts](../../packages/modules/src/governance/runtime-config.ts), [packages/modules/src/persistence/postgres/index.ts](../../packages/modules/src/persistence/postgres/index.ts), [tests/modules/governance.test.ts](../../tests/modules/governance.test.ts)
- Next gap: Implement PostgreSQL-backed bidirectional sync.

#### Authorization

- Governing manifest: [Manifest](../02-modules/access/authorization/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/access/authorization.ts](../../packages/modules/src/access/authorization.ts), [tests/modules/access.test.ts](../../tests/modules/access.test.ts)
- Security hardening: break-glass expiry validation, bounded cache with `maxCacheSize` (default 1000) plus expired-entry eviction and oldest-entry eviction, all vocabulary strings use shared constants.
- Next gap: Replace in-memory relation tuples with Ory Keto-backed checks.

#### Field security

- Governing manifest: [Manifest](../02-modules/access/field-security/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/access/field-security.ts](../../packages/modules/src/access/field-security.ts), [tests/modules/access.test.ts](../../tests/modules/access.test.ts)
- Security hardening: `regulated-sensitive` fields redacted for non-privileged actors, `secret` fields always redacted, anonymous actors see only `public` fields, all classification checks use shared `dataClassification.*` constants.
- Next gap: Wire projection enforcement into route and mutation response paths.

#### Audit log

- Governing manifest: [Manifest](../02-modules/governance/audit-log/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/governance/audit-log.ts](../../packages/modules/src/governance/audit-log.ts), [packages/modules/src/persistence/postgres/index.ts](../../packages/modules/src/persistence/postgres/index.ts), [tests/modules/governance.test.ts](../../tests/modules/governance.test.ts)
- Cleanup: `AuditEventSchema.action` now uses the shared module-scoped audit action constants from contracts, and audit builders and requirements use Effect-safe runtime decoding instead of live-path `Schema.validateSync` calls.
- Next gap: Implement append-only PostgreSQL storage and admin review surfaces.

#### File storage

- Governing manifest: [Manifest](../02-modules/data/file-storage/manifest.md)
- Status: scaffolded
- Evidence: [packages/platform/src/adapters/storage/convex.ts](../../packages/platform/src/adapters/storage/convex.ts)
- Next gap: Implement file lifecycle and legal hold.

#### Tenant branding

- Governing manifest: [Manifest](../02-modules/domains/tenant-branding/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/domains/tenant-branding.ts](../../packages/modules/src/domains/tenant-branding.ts), [packages/modules/src/persistence/postgres/index.ts](../../packages/modules/src/persistence/postgres/index.ts), [tests/modules/domains.test.ts](../../tests/modules/domains.test.ts)
- Next gap: Implement persistent runtime overrides, asset publication workflows, and custom-domain verification.

#### Observability

- Governing manifest: [Manifest](../02-modules/domains/observability/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/domains/observability.ts](../../packages/modules/src/domains/observability.ts), [packages/platform/src/adapters/observability/observability.ts](../../packages/platform/src/adapters/observability/observability.ts), [tests/modules/domains.test.ts](../../tests/modules/domains.test.ts)
- Next gap: Add real telemetry emission and GlitchTip runtime wiring.

#### Billing and metering

- Governing manifest: [Manifest](../02-modules/domains/billing-and-metering/manifest.md)
- Status: scaffolded
- Evidence: [packages/platform/src/adapters/features-billing/polar.ts](../../packages/platform/src/adapters/features-billing/polar.ts), [packages/modules/src/domains/billing-webhook-processing.ts](../../packages/modules/src/domains/billing-webhook-processing.ts), [packages/modules/src/persistence/postgres/index.ts](../../packages/modules/src/persistence/postgres/index.ts), [tests/modules/billing-webhook-processing.test.ts](../../tests/modules/billing-webhook-processing.test.ts)
- Next gap: Wire plan listing, checkout start, webhook intake, and replay through app-owned server boundaries and live PostgreSQL infrastructure instead of module-only scaffolds.

#### Notification center

- Governing manifest: [Manifest](../02-modules/communication/notification-center/manifest.md)
- Status: scaffolded
- Evidence: [packages/platform/src/adapters/messaging/novu.ts](../../packages/platform/src/adapters/messaging/novu.ts)
- Next gap: Implement notification orchestration.

#### Feature flags

- Governing manifest: [Manifest](../02-modules/governance/feature-flags/manifest.md)
- Status: scaffolded
- Evidence: [packages/platform/src/adapters/features-billing/unleash.ts](../../packages/platform/src/adapters/features-billing/unleash.ts)
- Next gap: Implement cascade evaluation with entitlement gate.

#### Identity session

- Governing manifest: [Manifest](../02-modules/access/identity-session/manifest.md)
- Status: scaffolded
- Evidence: [packages/platform/src/adapters/identity/keycloak.ts](../../packages/platform/src/adapters/identity/keycloak.ts), [packages/modules/src/persistence/postgres/index.ts](../../packages/modules/src/persistence/postgres/index.ts), [tests/platform/adapters.test.ts](../../tests/platform/adapters.test.ts)
- Next gap: Implement auth start and auth callback handling, session lifecycle, and cache.

#### Search

- Governing manifest: [Manifest](../02-modules/data/search/manifest.md)
- Status: scaffolded
- Evidence: [packages/platform/src/adapters/search/meilisearch.ts](../../packages/platform/src/adapters/search/meilisearch.ts)
- Next gap: Implement index lifecycle and tenant-scoped search.

#### Workflow jobs

- Governing manifest: [Manifest](../02-modules/data/workflow-jobs/manifest.md)
- Status: scaffolded
- Evidence: [packages/platform/src/adapters/storage/convex.ts](../../packages/platform/src/adapters/storage/convex.ts)
- Next gap: Implement durable job orchestration on Convex actions and scheduling.

#### Email delivery

- Governing manifest: [Manifest](../02-modules/communication/email-delivery/manifest.md)
- Status: scaffolded
- Evidence: [packages/platform/src/adapters/messaging/postal.ts](../../packages/platform/src/adapters/messaging/postal.ts)
- Next gap: Implement template management and delivery tracking.

#### Webhooks API access

- Governing manifest: [Manifest](../02-modules/communication/webhooks-api-access/manifest.md)
- Status: scaffolded
- Evidence: [packages/config/src/manifests/communication/webhooks-api-access.ts](../../packages/config/src/manifests/communication/webhooks-api-access.ts)
- Next gap: Implement inbound provider webhook verification, idempotent processing, replay, and outbound webhook dispatch.

#### Import export

- Governing manifest: [Manifest](../02-modules/data/import-export/manifest.md)
- Status: scaffolded
- Evidence: [packages/config/src/manifests/data/import-export.ts](../../packages/config/src/manifests/data/import-export.ts)
- Next gap: Implement bulk import or export pipelines on Convex-backed jobs.

#### Retention legal hold

- Governing manifest: [Manifest](../02-modules/governance/retention-legal-hold/manifest.md)
- Status: scaffolded
- Evidence: [packages/config/src/manifests/governance/retention-legal-hold.ts](../../packages/config/src/manifests/governance/retention-legal-hold.ts)
- Next gap: Implement retention policies and legal hold enforcement.

#### Support operations

- Governing manifest: [Manifest](../02-modules/governance/support-operations/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/governance/support-operations.ts](../../packages/modules/src/governance/support-operations.ts), [tests/modules/governance.test.ts](../../tests/modules/governance.test.ts)
- Cleanup: break-glass grants now reject unauthenticated actors, unsupported actor classes, and expired expiry timestamps through typed Effect errors; tenant-isolation coverage now includes expired break-glass denial.
- Next gap: Replace break-glass and escalation scaffolds with Keycloak-backed impersonation flows.

### Validation Baseline

1. Repository validation for `validated` work currently means `bun run typecheck` and `bun run test` are green.
2. The current snapshot reflects those commands running green on 2026-04-13.
3. Test suite: 61 tests across 10 suites.
4. All source modules and test files use shared constants instead of raw vocabulary strings.
5. Security invariants (break-glass expiry, regulated-sensitive redaction, tenant isolation, cache eviction) all have explicit test coverage.
