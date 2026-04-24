# Implementation Tracker

Status: accepted

## Purpose

1. Provide a versioned delivery view next to the specs and ADRs.
2. Track whether each accepted area is documented, scaffolded, implemented, validated, or blocked.
3. Link tracker rows to the code, tests, and operator surfaces that justify the current status.
4. Act as the source of truth for current delivery maturity when accepted specs and ADRs intentionally lead the codebase.

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

Last updated: 2026-04-23

Roadmap: [Backend Readiness Roadmap](backend-readiness-roadmap.md)

Use this tracker, not the surrounding module or app catalog docs, to determine whether a capability is currently documented, scaffolded, implemented, validated, or blocked.

### Current Pattern Priorities To Reach 10/10

1. Promote the validated anonymous-to-entitled backend slice from code-level completion to live-environment readiness with webhook replay, smoke coverage, and runbooks.
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
- Evidence: [ops/docker/compose.yml](../../ops/docker/compose.yml), [ops/docker/observability/compose.yml](../../ops/docker/observability/compose.yml), [ops/docker/analytics/compose.yml](../../ops/docker/analytics/compose.yml), [ops/docker/analytics/Caddyfile](../../ops/docker/analytics/Caddyfile), [specs/04-ops/runbooks/openpanel-self-hosting.md](../04-ops/runbooks/openpanel-self-hosting.md), [packages/platform/src/adapters/observability/observability.ts](../../packages/platform/src/adapters/observability/observability.ts), [packages/platform/src/adapters/observability/openpanel.ts](../../packages/platform/src/adapters/observability/openpanel.ts), [packages/modules/src/domains/observability.ts](../../packages/modules/src/domains/observability.ts)
- Cleanup: The main compose entrypoint is now broken into included subfiles by concern, OpenPanel starts by default as part of the current dependency footprint with ownership rooted in `ops/docker/analytics/`, and the platform exposes a dedicated OpenPanel adapter boundary plus OpenPanel-native runtime fields.
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
- Evidence: [ops/docker/compose.yml](../../ops/docker/compose.yml), [ops/docker/observability/compose.yml](../../ops/docker/observability/compose.yml), [ops/docker/identity/compose.yml](../../ops/docker/identity/compose.yml), [ops/docker/feature-flags/compose.yml](../../ops/docker/feature-flags/compose.yml), [ops/docker/search/compose.yml](../../ops/docker/search/compose.yml), [ops/docker/messaging/compose.yml](../../ops/docker/messaging/compose.yml), [ops/docker/metering/compose.yml](../../ops/docker/metering/compose.yml), [ops/docker/analytics/compose.yml](../../ops/docker/analytics/compose.yml), [ops/docker/security/compose.yml](../../ops/docker/security/compose.yml), [ops/docker/README.md](../../ops/docker/README.md), [ops/docker/analytics/Caddyfile](../../ops/docker/analytics/Caddyfile), [ops/docker/analytics/init-db.sh](../../ops/docker/analytics/init-db.sh), [ops/docker/security/kong.yml](../../ops/docker/security/kong.yml), [ops/docker/security/vault.hcl](../../ops/docker/security/vault.hcl), [specs/03-adr/storage/ADR-017-shared-postgres-instance-isolated-service-databases.md](../03-adr/storage/ADR-017-shared-postgres-instance-isolated-service-databases.md), [specs/04-ops/runbooks/openpanel-self-hosting.md](../04-ops/runbooks/openpanel-self-hosting.md), [specs/04-ops/runbooks/kong-vault-bootstrap.md](../04-ops/runbooks/kong-vault-bootstrap.md)
- Cleanup: The deployment baseline now keeps one repo-managed Compose entrypoint in the root `ops/docker` folder while assigning each included compose file to its own concern folder, colocates Keycloak and observability runtime assets with their owning `identity/` and `observability/` concerns, moves OpenPanel runtime assets into `analytics/`, moves Kong and Vault runtime assets into `security/`, classifies example env values by seeded-local versus bootstrap-generated versus external-provider ownership, isolates Postgres-backed infrastructure dependencies into dedicated service databases on the shared local PostgreSQL engine, and ships operator runbooks for both current concern-owned service groups: `analytics` for OpenPanel and `security` for Kong plus Vault.
- Next gap: Add environment-specific deployment automation and validation for the full local stack plus concern-owned service groups.

#### Technology catalog

- Governing spec: [013 Technology Stack](../01-platform/architecture/013-technology-stack.md)
- Status: scaffolded
- Evidence: [specs/01-platform/architecture/013-technology-stack.md](../01-platform/architecture/013-technology-stack.md), [packages/platform/src/index.ts](../../packages/platform/src/index.ts), [packages/platform/src/adapters/observability/openpanel.ts](../../packages/platform/src/adapters/observability/openpanel.ts), [packages/platform/src/services/platform-environment.ts](../../packages/platform/src/services/platform-environment.ts)
- Cleanup: platform adapter boundaries now enforce non-empty runtime-facing configuration and identifiers, preserve `ParseResult.ParseError` on decoded runtime inputs, expose real Keycloak, Valkey, Ory Keto, OpenPanel, and Polar service boundaries, and centralize adapter service names and healthcheck schemas in `packages/platform/src/adapters/service-names.ts`.
- Next gap: Complete adapter health probes and integration tests.

#### Convex identity-backed execution

- Governing spec: [003](../01-platform/access/003-tenant-identity-and-access.md), [Identity Session Manifest](../02-modules/access/identity-session/manifest.md), [Billing And Metering Manifest](../02-modules/domains/billing-and-metering/manifest.md), [ADR-019](../03-adr/identity/ADR-019-keycloak-backed-convex-identity-execution.md)
- Status: implemented
- Evidence: [packages/contracts/src/access/identity-claims.ts](../../packages/contracts/src/access/identity-claims.ts), [packages/platform/src/adapters/storage/convex.ts](../../packages/platform/src/adapters/storage/convex.ts), [convex/keycloakWorkflowIdentity.ts](../../convex/keycloakWorkflowIdentity.ts), [convex/workflowJobRunner.ts](../../convex/workflowJobRunner.ts), [convex/workflowJobs.ts](../../convex/workflowJobs.ts), [packages/platform/src/services/domains/admin-billing.ts](../../packages/platform/src/services/domains/admin-billing.ts), [tooling/scripts/subscriber-journey/bootstrap.ts](../../tooling/scripts/subscriber-journey/bootstrap.ts), [tests/platform/convex-workflow-job-runner.test.ts](../../tests/platform/convex-workflow-job-runner.test.ts), [tests/platform/subscriber-journey.test.ts](../../tests/platform/subscriber-journey.test.ts)
- Next gap: Extend the same claim-gated Keycloak execution model to future Convex-backed operator workflows beyond billing reconciliation.

#### Backend-owned HTTP API layer

- Governing spec: [Backend Readiness Roadmap](backend-readiness-roadmap.md), [013 Technology Stack](../01-platform/architecture/013-technology-stack.md), [ADR-018](../03-adr/architecture/ADR-018-h3-backend-http-layer.md)
- Status: implemented
- Evidence: [packages/platform/src/http/backend-api.ts](../../packages/platform/src/http/backend-api.ts), [packages/platform/src/http/request-middleware.ts](../../packages/platform/src/http/request-middleware.ts), [packages/platform/src/http/index.ts](../../packages/platform/src/http/index.ts), [packages/platform/src/http/openapi-document.ts](../../packages/platform/src/http/openapi-document.ts), [packages/platform/src/http/openapi.ts](../../packages/platform/src/http/openapi.ts), [packages/platform/src/services/domains/subscriber-journey-http.ts](../../packages/platform/src/services/domains/subscriber-journey-http.ts), [packages/platform/src/services/domains/admin-billing-http.ts](../../packages/platform/src/services/domains/admin-billing-http.ts), [packages/platform/src/services/governance/admin-governance-http.ts](../../packages/platform/src/services/governance/admin-governance-http.ts), [tests/platform/backend-api.test.ts](../../tests/platform/backend-api.test.ts), [tests/platform/backend-api-request-middleware.test.ts](../../tests/platform/backend-api-request-middleware.test.ts), [tooling/scripts/run-subscriber-journey-api.ts](../../tooling/scripts/run-subscriber-journey-api.ts)
- Cleanup: the standalone backend entrypoint now mounts the existing Request/Response handlers through one shared H3 app so backend-owned APIs keep Effect business logic while gaining an explicit routing boundary for external callers, its OpenAPI JSON plus Swagger UI are generated from the same Effect request and response schemas that define the transport boundary, the shared request wrapper now injects or preserves correlation IDs, emits request-scoped telemetry, and returns a correlation-aware fallback response for uncaught handler failures, and the communication-layer HTTP helpers now centralize shared JSON decoding, tagged-error guards, method routing responses, and Effect-to-Response matching across backend-owned handlers while first-party auth edges reuse the same request-boundary and response helpers.
- Next gap: Move authorization and webhook verification into the same H3 boundary so those cross-cutting concerns stop living in per-handler adapters, while keeping future domain-specific error mapping from drifting back into local transport shells.

#### Security hygiene automation

- Governing spec: [010 Deployment Profiles](../01-platform/architecture/010-deployment-profiles.md), [013 Technology Stack](../01-platform/architecture/013-technology-stack.md)
- Status: implemented
- Evidence: [.github/workflows/security-hygiene.yml](../../.github/workflows/security-hygiene.yml), [.github/dependabot.yml](../../.github/dependabot.yml)
- Next gap: Add image digest pinning for first-party app images once app Dockerfiles exist.

### Architecture Decision Records

| ADR                                                                                                                                                | Status   | Evidence                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------- |
| [ADR-001 Modular Monolith](../03-adr/architecture/ADR-001-modular-monolith.md)                                                                     | accepted | Repository structure       |
| [ADR-002 Convex PostgreSQL Split](../03-adr/storage/ADR-002-convex-postgres-split.md)                                                              | accepted | Compose + adapters         |
| [ADR-003 Convex Storage First](../03-adr/storage/ADR-003-convex-storage-first.md)                                                                  | accepted | Compose                    |
| [ADR-004 Keycloak First Identity](../03-adr/identity/ADR-004-keycloak-first-identity.md)                                                           | accepted | Compose + adapter          |
| [ADR-005 Open Source Dependency Policy](../03-adr/architecture/ADR-005-open-source-dependency-policy.md)                                           | accepted | Tech stack spec            |
| [ADR-006 Instant App State Strategy](../03-adr/runtime/ADR-006-instant-app-state-strategy.md)                                                      | accepted | Convex adapter             |
| [ADR-007 No-Redeploy Runtime Config Sync](../03-adr/runtime/ADR-007-no-redeploy-runtime-config-sync.md)                                            | accepted | Config package             |
| [ADR-008 Ory Keto Authorization](../03-adr/identity/ADR-008-ory-keto-authz.md)                                                                     | accepted | Compose + adapter          |
| [ADR-009 Unleash Feature Flags](../03-adr/runtime/ADR-009-unleash-feature-flags.md)                                                                | accepted | Compose + adapter          |
| [ADR-010 Drizzle ORM](../03-adr/storage/ADR-010-drizzle-orm.md)                                                                                    | accepted | Referenced in specs        |
| [ADR-011 Effect Runtime Backbone](../03-adr/runtime/ADR-011-effect-runtime-backbone.md)                                                            | accepted | All platform packages      |
| [ADR-012 Postal Email Delivery](../03-adr/communication/ADR-012-postal-email-delivery.md)                                                          | accepted | Compose + adapter          |
| [ADR-013 Docker Hardened Images Policy](../03-adr/architecture/ADR-013-docker-hardened-images-policy.md)                                           | accepted | Docs + security CI         |
| [ADR-014 Tenant Branding Strategy](../03-adr/domains/ADR-014-tenant-branding-strategy.md)                                                          | accepted | White-label spec set       |
| [ADR-015 Convex Native Workflows And GlitchTip Error Tracking](../03-adr/domains/ADR-015-convex-native-workflows-and-glitchtip-error-tracking.md)  | accepted | Specs + adapters + Compose |
| [ADR-016 OpenPanel Self-Hosted Analytics](../03-adr/domains/ADR-016-openpanel-self-hosted-analytics.md)                                            | accepted | Specs + adapter + Compose  |
| [ADR-017 Shared PostgreSQL Instance, Isolated Service Databases](../03-adr/storage/ADR-017-shared-postgres-instance-isolated-service-databases.md) | accepted | Specs + Compose            |
| [ADR-018 H3 Backend HTTP Layer](../03-adr/architecture/ADR-018-h3-backend-http-layer.md)                                                           | accepted | Platform HTTP entrypoint   |
| [ADR-019 Keycloak-Backed Convex Identity Execution](../03-adr/identity/ADR-019-keycloak-backed-convex-identity-execution.md)                       | accepted | Specs + Convex auth slice  |

### Applications

#### Public web

- Governing spec: [Public Web Spec](../02-apps/public-web/spec.md)
- Status: implemented
- Evidence: [apps/public-web/src/routes/index.tsx](../../apps/public-web/src/routes/index.tsx), [apps/public-web/src/routes/auth/start.ts](../../apps/public-web/src/routes/auth/start.ts), [packages/platform/src/services/apps/app-snapshots.ts](../../packages/platform/src/services/apps/app-snapshots.ts), [packages/platform/src/services/domains/subscriber-journey.ts](../../packages/platform/src/services/domains/subscriber-journey.ts), [packages/platform/src/services/apps/subscriber-journey-actions.ts](../../packages/platform/src/services/apps/subscriber-journey-actions.ts), [tests/platform/app-auth-routes.test.ts](../../tests/platform/app-auth-routes.test.ts), [tests/platform/services.test.ts](../../tests/platform/services.test.ts), [tests/platform/subscriber-journey.test.ts](../../tests/platform/subscriber-journey.test.ts)
- Next gap: Add hosted checkout start and return routes on the same validated server-owned boundary.

#### Product app

- Governing spec: [Product App Spec](../02-apps/product-app/spec.md)
- Status: implemented
- Evidence: [apps/product-app/src/routes/index.tsx](../../apps/product-app/src/routes/index.tsx), [apps/product-app/src/routes/auth/callback.ts](../../apps/product-app/src/routes/auth/callback.ts), [packages/platform/src/services/apps/app-snapshots.ts](../../packages/platform/src/services/apps/app-snapshots.ts), [packages/platform/src/services/domains/subscriber-journey.ts](../../packages/platform/src/services/domains/subscriber-journey.ts), [packages/platform/src/services/apps/subscriber-journey-actions.ts](../../packages/platform/src/services/apps/subscriber-journey-actions.ts), [tests/platform/app-auth-routes.test.ts](../../tests/platform/app-auth-routes.test.ts), [tests/platform/services.test.ts](../../tests/platform/services.test.ts), [tests/platform/subscriber-journey.test.ts](../../tests/platform/subscriber-journey.test.ts)
- Next gap: Add logout, stale-session recovery, and post-checkout billing return routes on the same request-transport boundary.

#### Admin app

- Governing spec: [Admin App Spec](../02-apps/admin-app/spec.md)
- Status: scaffolded
- Evidence: [apps/admin-app/src/routes/index.tsx](../../apps/admin-app/src/routes/index.tsx), [packages/platform/src/services/apps/app-snapshots.ts](../../packages/platform/src/services/apps/app-snapshots.ts), [packages/platform/src/services/governance/admin-governance.ts](../../packages/platform/src/services/governance/admin-governance.ts), [packages/platform/src/services/governance/admin-governance-http.ts](../../packages/platform/src/services/governance/admin-governance-http.ts), [packages/platform/src/services/domains/admin-billing.ts](../../packages/platform/src/services/domains/admin-billing.ts), [packages/platform/src/services/apps/admin-billing-actions.ts](../../packages/platform/src/services/apps/admin-billing-actions.ts), [packages/platform/src/services/domains/admin-billing-http.ts](../../packages/platform/src/services/domains/admin-billing-http.ts), [tests/platform/services.test.ts](../../tests/platform/services.test.ts), [tests/platform/admin-governance-http.test.ts](../../tests/platform/admin-governance-http.test.ts), [tests/platform/admin-billing-http.test.ts](../../tests/platform/admin-billing-http.test.ts)
- Next gap: Replace the remaining snapshot-only admin interactions with direct governance mutation helpers and ship explicit admin-app UI surfaces for the existing backend-owned billing reconciliation controls.

### Modules

#### Tenant management

- Governing manifest: [Manifest](../02-modules/domains/tenant-management/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/domains/tenant-management.ts](../../packages/modules/src/domains/tenant-management.ts), [packages/platform/src/services/domains/subscriber-journey.ts](../../packages/platform/src/services/domains/subscriber-journey.ts), [packages/platform/src/services/domains/admin-billing.ts](../../packages/platform/src/services/domains/admin-billing.ts), [convex/workflowJobs.ts](../../convex/workflowJobs.ts), [convex/workflowJobRunner.ts](../../convex/workflowJobRunner.ts), [convex/crons.ts](../../convex/crons.ts), [tests/modules/domains.test.ts](../../tests/modules/domains.test.ts), [tests/platform/subscriber-journey.test.ts](../../tests/platform/subscriber-journey.test.ts)
- Next gap: Add dedicated admin-app repair controls and operator-driven replay or cancellation workflows for unresolved tenant repair gaps.

#### Runtime config

- Governing manifest: [Manifest](../02-modules/governance/config-runtime/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/governance/runtime-config.ts](../../packages/modules/src/governance/runtime-config.ts), [packages/modules/src/persistence/postgres/governance/runtime-config-repository.ts](../../packages/modules/src/persistence/postgres/governance/runtime-config-repository.ts), [tests/modules/governance.test.ts](../../tests/modules/governance.test.ts)
- Next gap: Implement approval workflows and extend the current first-party operator read surfaces into end-to-end approval workflows over persisted overrides and sync artifacts.

#### Authorization

- Governing manifest: [Manifest](../02-modules/access/authorization/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/access/authorization.ts](../../packages/modules/src/access/authorization.ts), [packages/platform/src/services/access/authorization-delegation.ts](../../packages/platform/src/services/access/authorization-delegation.ts), [packages/platform/src/services/domains/subscriber-journey.ts](../../packages/platform/src/services/domains/subscriber-journey.ts), [packages/platform/src/services/domains/admin-billing.ts](../../packages/platform/src/services/domains/admin-billing.ts), [tests/modules/access.test.ts](../../tests/modules/access.test.ts), [tests/platform/subscriber-journey.test.ts](../../tests/platform/subscriber-journey.test.ts)
- Security hardening: break-glass expiry validation, Ory Keto-backed delegated checks as the authorization source of truth, bounded cache with `maxCacheSize` (default 1000) plus expired-entry eviction and oldest-entry eviction, all vocabulary strings use shared constants.
- Next gap: Add persisted tuple inspection and admin review surfaces so explainability is backed by Ory-managed relation reads instead of local synthesized matches.

#### Field security

- Governing manifest: [Manifest](../02-modules/access/field-security/manifest.md)
- Status: implemented
- Evidence: [packages/modules/src/access/field-security.ts](../../packages/modules/src/access/field-security.ts), [packages/platform/src/services/domains/subscriber-journey.ts](../../packages/platform/src/services/domains/subscriber-journey.ts), [packages/platform/src/services/governance/admin-governance.ts](../../packages/platform/src/services/governance/admin-governance.ts), [packages/platform/src/services/governance/admin-governance-http.ts](../../packages/platform/src/services/governance/admin-governance-http.ts), [packages/platform/src/services/apps/app-snapshots.ts](../../packages/platform/src/services/apps/app-snapshots.ts), [tests/modules/access.test.ts](../../tests/modules/access.test.ts), [tests/platform/admin-governance.test.ts](../../tests/platform/admin-governance.test.ts), [tests/platform/admin-governance-http.test.ts](../../tests/platform/admin-governance-http.test.ts)
- Security hardening: `regulated-sensitive` fields redacted for non-privileged actors, `secret` fields always redacted, anonymous actors see only `public` fields, product bootstrap and admin-governance read surfaces now return manifest-projected payloads, admin-governance HTTP reads and mutations resolve request context from session-backed Valkey state instead of caller-asserted request bodies, direct and HTTP governance reads plus runtime-config mutations enforce platform/support-operator access, mutation responses now return projected envelopes, and sensitive projected governance reads plus mutation responses emit field-security audit events when audited fields remain visible.
- Next gap: Carry the same trusted-session, projected-envelope mutation pattern into future admin governance approval workflows beyond the current runtime-config surfaces.

#### Audit log

- Governing manifest: [Manifest](../02-modules/governance/audit-log/manifest.md)
- Status: scaffolded
- Evidence: [packages/modules/src/governance/audit-log.ts](../../packages/modules/src/governance/audit-log.ts), [packages/modules/src/persistence/postgres/governance/audit-log-repository.ts](../../packages/modules/src/persistence/postgres/governance/audit-log-repository.ts), [packages/platform/src/services/governance/admin-governance.ts](../../packages/platform/src/services/governance/admin-governance.ts), [packages/platform/src/services/governance/admin-governance-http.ts](../../packages/platform/src/services/governance/admin-governance-http.ts), [tests/modules/governance.test.ts](../../tests/modules/governance.test.ts), [tests/platform/admin-governance-http.test.ts](../../tests/platform/admin-governance-http.test.ts)
- Cleanup: `AuditEventSchema.action` now uses the shared module-scoped audit action constants from contracts, and audit builders and requirements use Effect-safe runtime decoding instead of live-path `Schema.validateSync` calls.
- Next gap: Expand audit review beyond module-scoped queries and complete operator workflows on top of the current module-scoped read surface.

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
- Status: implemented
- Evidence: [packages/platform/src/adapters/features-billing/polar.ts](../../packages/platform/src/adapters/features-billing/polar.ts), [packages/modules/src/domains/billing-webhook-processing.ts](../../packages/modules/src/domains/billing-webhook-processing.ts), [packages/modules/src/persistence/postgres/billing-state-repository.ts](../../packages/modules/src/persistence/postgres/billing-state-repository.ts), [packages/modules/src/persistence/postgres/domains/workflow-jobs-repository.ts](../../packages/modules/src/persistence/postgres/domains/workflow-jobs-repository.ts), [packages/platform/src/services/domains/subscriber-journey.ts](../../packages/platform/src/services/domains/subscriber-journey.ts), [packages/platform/src/services/domains/subscriber-journey-http.ts](../../packages/platform/src/services/domains/subscriber-journey-http.ts), [packages/platform/src/services/domains/admin-billing.ts](../../packages/platform/src/services/domains/admin-billing.ts), [packages/platform/src/services/apps/admin-billing-actions.ts](../../packages/platform/src/services/apps/admin-billing-actions.ts), [packages/platform/src/services/domains/admin-billing-http.ts](../../packages/platform/src/services/domains/admin-billing-http.ts), [tooling/scripts/run-subscriber-journey-api.ts](../../tooling/scripts/run-subscriber-journey-api.ts), [tests/modules/billing-webhook-processing.test.ts](../../tests/modules/billing-webhook-processing.test.ts), [tests/platform/subscriber-journey.test.ts](../../tests/platform/subscriber-journey.test.ts), [tests/platform/admin-billing-http.test.ts](../../tests/platform/admin-billing-http.test.ts)
- Cleanup: backend-only operator-triggered repair-gap replay now routes through admin-billing service and HTTP adapters while preserving operator identity for workflow execution.
- Next gap: Add operator-visible cancellation controls for unresolved repair gaps and expand reconciliation coverage beyond the current billing-focused convergence paths.

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
- Status: implemented
- Evidence: [packages/contracts/src/runtime/redirect-uris.ts](../../packages/contracts/src/runtime/redirect-uris.ts), [packages/platform/src/adapters/identity/keycloak.ts](../../packages/platform/src/adapters/identity/keycloak.ts), [packages/modules/src/access/identity-session.ts](../../packages/modules/src/access/identity-session.ts), [packages/modules/src/persistence/postgres/identity-session-repository.ts](../../packages/modules/src/persistence/postgres/identity-session-repository.ts), [packages/modules/src/persistence/postgres/tenant-onboarding-repository.ts](../../packages/modules/src/persistence/postgres/tenant-onboarding-repository.ts), [packages/platform/src/services/access/request-context-transport.ts](../../packages/platform/src/services/access/request-context-transport.ts), [packages/platform/src/services/domains/subscriber-journey-http.ts](../../packages/platform/src/services/domains/subscriber-journey-http.ts), [tests/modules/access.test.ts](../../tests/modules/access.test.ts), [tests/platform/app-auth-routes.test.ts](../../tests/platform/app-auth-routes.test.ts), [tests/platform/subscriber-journey.test.ts](../../tests/platform/subscriber-journey.test.ts)
- Next gap: Reuse the same session-to-token provenance binding for additional backend-owned operator workflows and session-backed service boundaries beyond billing reconciliation.

#### Search

- Governing manifest: [Manifest](../02-modules/data/search/manifest.md)
- Status: scaffolded
- Evidence: [packages/platform/src/adapters/search/meilisearch.ts](../../packages/platform/src/adapters/search/meilisearch.ts)
- Next gap: Implement index lifecycle and tenant-scoped search.

#### Workflow jobs

- Governing manifest: [Manifest](../02-modules/data/workflow-jobs/manifest.md)
- Status: implemented
- Evidence: [packages/contracts/src/data/workflow-jobs.ts](../../packages/contracts/src/data/workflow-jobs.ts), [packages/modules/src/domains/workflow-jobs.ts](../../packages/modules/src/domains/workflow-jobs.ts), [packages/modules/src/persistence/postgres/domains/workflow-jobs.ts](../../packages/modules/src/persistence/postgres/domains/workflow-jobs.ts), [packages/modules/src/persistence/postgres/domains/workflow-jobs-repository.ts](../../packages/modules/src/persistence/postgres/domains/workflow-jobs-repository.ts), [packages/platform/src/services/domains/subscriber-journey.ts](../../packages/platform/src/services/domains/subscriber-journey.ts), [packages/platform/src/services/domains/admin-billing.ts](../../packages/platform/src/services/domains/admin-billing.ts), [packages/platform/src/services/domains/admin-billing-http.ts](../../packages/platform/src/services/domains/admin-billing-http.ts), [convex/workflowJobs.ts](../../convex/workflowJobs.ts), [convex/workflowJobRunner.ts](../../convex/workflowJobRunner.ts), [convex/crons.ts](../../convex/crons.ts), [tests/platform/subscriber-journey.test.ts](../../tests/platform/subscriber-journey.test.ts), [tests/platform/admin-billing-http.test.ts](../../tests/platform/admin-billing-http.test.ts)
- Next gap: Persist Convex scheduler handles or targeted recovery provenance for operator-visible cancellation controls and broaden the module beyond billing-focused reconciliation jobs.

#### Email delivery

- Governing manifest: [Manifest](../02-modules/communication/email-delivery/manifest.md)
- Status: scaffolded
- Evidence: [packages/platform/src/adapters/messaging/postal.ts](../../packages/platform/src/adapters/messaging/postal.ts)
- Next gap: Implement template management and delivery tracking.

#### Webhooks API access

- Governing manifest: [Manifest](../02-modules/communication/webhooks-api-access/manifest.md)
- Status: implemented
- Evidence: [packages/config/src/manifests/communication/webhooks-api-access.ts](../../packages/config/src/manifests/communication/webhooks-api-access.ts), [packages/modules/src/domains/webhooks-api-access.ts](../../packages/modules/src/domains/webhooks-api-access.ts), [packages/modules/src/persistence/postgres/domains/billing-webhook-replay-repository.ts](../../packages/modules/src/persistence/postgres/domains/billing-webhook-replay-repository.ts), [packages/platform/src/services/communication/webhooks-api-access-http.ts](../../packages/platform/src/services/communication/webhooks-api-access-http.ts), [tests/modules/webhooks-api-access.test.ts](../../tests/modules/webhooks-api-access.test.ts), [tests/platform/webhooks-api-access-http.test.ts](../../tests/platform/webhooks-api-access-http.test.ts)
- Cleanup: inbound provider webhook processing and replay now route through a dedicated module service and dedicated communication HTTP boundary instead of remaining embedded only in subscriber-journey orchestration, while the public URL surface stays unchanged and the subscriber-journey route registry remains scoped to subscriber-owned paths.
- Next gap: Add outbound webhook subscription management, delivery retry or backoff flows, and API key lifecycle beyond the current billing-provider intake slice.

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

1. Repository validation for `validated` work currently means `bun run format:check`, `bun run typecheck`, and `bun run test` are green.
2. The current snapshot reflects those commands running green on 2026-04-23.
3. Test suite: 260 tests across 23 suites.
4. All source modules and test files use shared constants instead of raw vocabulary strings.
5. Security invariants (break-glass expiry, regulated-sensitive redaction, tenant isolation, cache eviction) all have explicit test coverage.
