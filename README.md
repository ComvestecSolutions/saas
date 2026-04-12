# Comvestec SaaS Foundation

This repository contains the reusable SaaS foundation for Comvestec Solutions.

## Repository Governance

1. Contribution workflow: [CONTRIBUTING.md](CONTRIBUTING.md)
2. Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
3. Support guidance: [SUPPORT.md](SUPPORT.md)
4. Security reporting: [SECURITY.md](SECURITY.md)
5. License: [LICENSE](LICENSE)

## Contribution Workflow

1. Use `main`, `dev`, or a branch named as `<type>/<scope>-<short-slug>`.
2. Keep one primary change area per commit and use Conventional Commits with a required scope.
3. Open pull requests into `dev` and keep the PR body aligned with the required headings in `.github/pull_request_template.md`.
4. GitHub applies path-based labels automatically from changed paths, so PRs do not need manual affected-surface checklists.
5. Local hooks and GitHub workflows validate branch names, grouped staged changes, commit messages, formatting, and PR body headings.

## Current State

The repository now includes the first backend-focused implementation slice:

1. repository-level Copilot instructions in `.github/copilot-instructions.md`
2. foundational platform specs including technology stack catalog
3. core ADRs (15 accepted decisions)
4. 18 module manifests with scoped config, flag, and permission declarations
5. initial Bun and Turborepo workspace bootstrap
6. Effect-based shared contracts and runtime services with contracts split by backend concern and config manifests split by owning module
7. Jest test harness executed through Bun scripts
8. TanStack Start shells for the public web, product app, and admin app
9. pinned Docker Compose baseline for PostgreSQL, Keycloak, Convex, Valkey, Ory Keto, Unleash, Meilisearch, Novu, OpenMeter, Postal, GlitchTip, Prometheus, Loki, Tempo, Grafana, and OpenTelemetry Collector
10. 14 Effect-based platform adapters (Keycloak, Convex, PostgreSQL, Observability, Valkey, Ory Keto, Unleash, GlitchTip, PostHog, Novu, Meilisearch, Polar, OpenMeter, Postal) organized under concern folders behind a consolidated adapters barrel, with shared platform-local service-name vocabulary and healthcheck schema helpers
11. initial Playwright package for future browser and agent-driven tests

## Backend Priorities

1. establish identity, tenancy, field-security, and authorization flows
2. implement Convex functions and PostgreSQL-backed system modules
3. harden runtime config, audit, and observability behavior
4. keep the TanStack Start app shells thin until backend runtime paths are usable end to end
5. treat broader frontend expansion as last-mile work after backend contracts, services, and operator workflows are stable

## Foundation Quality Bar

1. Adapter pattern: adapters own vendor-specific configuration, payload translation, health probes, and typed boundary validation only. They expose Effect-based methods, preserve concrete parse error channels, and keep runtime-facing non-empty fields behind `Schema.NonEmptyString`.
2. Module pattern: a capability is not treated as implemented just because a manifest or adapter exists. The owning module must define the shared contract, runtime service, persistence or audit ownership, and operator-facing workflow.
3. Governance pattern: runtime config, audit, entitlement, billing, compliance, and approval flows use durable PostgreSQL-backed state as the source of truth. In-memory state is limited to bounded cache-like accelerators and scaffolds.
4. App shell pattern: the public web, product app, and admin app compose shared Effects and typed snapshots. They do not duplicate policy, authorization, config resolution, or vendor-specific integration logic.
5. Integration completion pattern: a dependency is not foundation-complete until its adapter exists, the owning module consumes it, the operator or admin workflow is identified, and the integration has a validation path.
6. Validation pattern: contract and module tests set the baseline first; integration validation follows once the external service wiring is real.

## Current Pattern Priorities

1. move runtime config sync, approvals, and drift history fully into PostgreSQL-backed operator workflows
2. replace in-memory authorization scaffolding with Ory Keto-backed enforcement boundaries
3. turn observability adapters into real telemetry, error-tracking, and audit emission paths

## Backend Package Layout

1. `packages/contracts/src/index.ts` is an export surface only. Real contract implementations live under domain folders: `access/`, `data/`, `module-registry/`, `runtime/`, and `domains/`. No compatibility barrels remain at the package root.
2. `packages/config/src/index.ts` is an export surface only; platform defaults, environment schemas, typed manifest helpers, and the module manifest registry live in separate files.
3. Module manifests live under `packages/config/src/manifests/` organized into domain folders: `access/`, `governance/`, `domains/`, `communication/`, and `data/`. Each manifest file declares config, flags, permissions, and projections for a single module.
4. `packages/modules/src/index.ts` is an export surface only. Real module implementations live under `access/`, `governance/`, `domains/`, and `persistence/`.
5. `packages/platform/src/adapters/index.ts` is an export surface only. Real adapter implementations live under concern folders: `identity/`, `storage/`, `messaging/`, `observability/`, `features-billing/`, and `search/`. Shared adapter service names and reusable healthcheck schema helpers live in `packages/platform/src/adapters/service-names.ts` and are re-exported through the adapters barrel.
6. Manifests should be authored through typed helpers such as `defineModuleManifest`, `defineModuleConfigKeys`, and `defineModuleFeatureFlags` so module-scoped key prefixes and owners are checked at compile time.
7. Module field paths should be declared once in named `...Fields` constants through `defineModuleFields(...)`, then consumed through `defineProjectionDescriptors(...)` and `defineDataClassificationDeclarations(...)` so projection and classification typos fail at compile time instead of silently widening exposure.
8. Reusable backend vocabularies such as module ids, scopes, permissions, projection profiles, cross-module capabilities, config keys, feature-flag keys, runtime-value keys, shared host defaults, and platform adapter service names should be centralized as named constants plus schemas in shared packages. Runtime code and tests should import those constants instead of retyping raw strings.
9. When a literal registry or package root starts spanning unrelated domains or growing into a catch-all file, split it by domain folders before adding more values.
10. Module spec docs under `specs/02-modules/` are organized into the same domain grouping: `access/`, `governance/`, `domains/`, `communication/`, and `data/`.

## Security Invariants

1. Break-glass access must validate `expiresAt` against the current time. An expired break-glass context is denied, not silently accepted.
2. Fields classified as `regulated-sensitive` are redacted for any actor that is not `platform-operator` or `support-operator`. This check lives in the field-security module, not in UI code.
3. Fields classified as `secret` are always redacted regardless of actor type. Anonymous actors may only see `public` fields.
4. In-memory caches and request-volume collections are bounded with `maxCacheSize`, expired-entry eviction where applicable, and oldest-entry eviction to prevent unbounded growth.
5. Tenant isolation denies cross-tenant access unless a valid, non-expired break-glass context exists for a privileged actor type.
6. Environment and configuration schemas use `Schema.NonEmptyString` for any field where an empty string is never valid.

## Test Organization

1. Tests live under `tests/` with `contracts/`, `modules/`, and `platform/` subfolders.
2. Shared fixtures use module-scoped `_fixtures.ts` files (e.g., `tests/modules/_fixtures.ts`).
3. Compile-time type assertions live in `tests/type-assertions.ts`.
4. Test fixtures and expectations use shared constants (`platformModuleId.*`, `actorType.*`, `permissionScope.*`, `platformScope.*`, `dataClassification.*`) instead of raw strings. Raw strings are only used as decode inputs to explicitly test `Schema.decodeUnknown` boundary behavior.
5. Every security-sensitive path (break-glass expiry, regulated-sensitive redaction, tenant isolation, cache eviction) has explicit test coverage.

## Runtime Config Model

1. Runtime config and feature state are designed for no-redeploy changes once the schema is declared.
2. The codebase keeps config declarations, defaults, and ownership metadata in shared registries and manifests for reviewability and agent-driven edits.
3. PostgreSQL stores effective values, approvals, history, and sync or drift state.
4. Synchronization between the codebase and PostgreSQL-backed runtime state is bidirectional.
5. Code-side approval is the committed code change; database-side approval requires an authenticated user with the proper permissions.
6. Admin surfaces must show declared, persisted, and effective state instead of only one layer.

## Progress Tracking

Implementation progress is tracked in [specs/00-governance/implementation-tracker.md](specs/00-governance/implementation-tracker.md).

1. The tracker is the versioned delivery view for this repository.
2. It records whether a spec area is documented, scaffolded, implemented, validated, or blocked.
3. Status changes should be updated in the same change as the code or spec work they describe.
4. A row should stay `scaffolded` until the adapter, owning module, persistence or audit ownership, and operator workflow are all explicit.

## Tooling

1. Bun is the package manager and script runner.
2. Effect is the runtime backbone for shared services, schemas, and environment modeling.
3. Jest is the current unit-test framework and is invoked through Bun scripts. The root suite currently runs in band to avoid worker force-exit noise in the small backend test harness.
4. Playwright is scaffolded for future frontend and agent-driven browser testing.
5. Drizzle is the ORM / query builder for all PostgreSQL interactions.
6. Ory Keto provides relationship-based authorization.
7. Unleash provides feature flag evaluation and rollout management.
8. Postal provides self-hosted transactional email delivery.

## Effect Usage

1. First-party runtime logic lives behind shared Effect services and `Effect.Effect` return values in workspace packages, not inside UI components or route-local ad hoc helpers.
2. Shared contracts and configuration types should be derived from Effect Schema definitions so runtime validation and TypeScript types stay aligned.
3. Runtime inputs should prefer `Schema.decodeUnknown` and typed Effect error channels. When a function decodes runtime input, keep the concrete parse error type such as `ParseResult.ParseError` instead of widening it to `unknown`. `Schema.decodeUnknownSync` is reserved for static constant validation at module load and for tests.
4. Static schema-backed constants should use `Schema.validateSync(schema)(value)` together with `satisfies` so invalid literals fail at compile time before runtime validation.
5. TanStack Start routes and server functions are thin framework adapters: they call shared Effects and only bridge into promises at the framework edge.
6. Generated TanStack route tree files may still contain `as any` because they are tooling output; do not hand-edit those files.
7. Use `Schema.NonEmptyString` instead of `Schema.String` for environment variables, API keys, URLs, adapter configuration, and identifiers or payload fields where an empty string is never valid.
8. Represent recoverable backend failures through typed Effect errors (using `_tag` discriminants) rather than raw `throw new Error(...)` in first-party runtime code.

## Dependency Hygiene

1. Pin current stable versions when introducing new dependencies.
2. Do not use prerelease or canary builds unless an ADR explicitly approves them.
3. Do not use unpinned Docker `latest` tags in committed Compose files.
4. Use automated update and security scanning to keep npm packages and container references current.

## Security Hygiene

1. `bun audit` is part of the repository hygiene baseline and is currently clean as of 2026-04-05.
2. Dependabot is configured for npm, Docker, and GitHub Actions updates in `.github/dependabot.yml`.
3. Trivy scans the repository filesystem, configuration, and pinned container images in `.github/workflows/security-hygiene.yml`.
4. Docker Hardened Images are the default policy for future first-party app Dockerfiles, but not for vendor infrastructure images such as PostgreSQL, Keycloak, Grafana, or Meilisearch.
5. Pinned images reduce drift, but no repository should claim to be permanently CVE-free without continuous scanning.

## Workspace Commands

1. `bun install`
2. `bun run test`
3. `bun run typecheck`
4. `docker compose --env-file .env -f ops/docker/compose.yml up -d`

## Local Ports

1. public web: `http://localhost:3000`
2. product app: `http://localhost:3002`
3. admin app: `http://localhost:3004`
4. Convex API: `http://127.0.0.1:3210`
5. Convex dashboard: `http://localhost:6791`
6. Keycloak: `http://localhost:8080`
7. Ory Keto read: `http://localhost:4466`
8. Ory Keto write: `http://localhost:4467`
9. Unleash: `http://localhost:4242`
10. Valkey: `redis://localhost:6379`
11. Meilisearch: `http://localhost:7700`
12. Novu: `http://localhost:3100`
13. OpenMeter: `http://localhost:8889`
14. Postal: `http://localhost:5000`
15. GlitchTip: `http://localhost:8001`
16. Grafana: `http://localhost:3001`
17. Prometheus: `http://localhost:9090`
18. Tempo: `http://localhost:3200`

See the specification entry point in [specs/README.md](specs/README.md).
