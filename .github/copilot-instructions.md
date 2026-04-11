# Comvestec Solutions SaaS Foundation Instructions

## Purpose

This repository is the reusable SaaS foundation for Comvestec Solutions. Every change must strengthen the platform as a product line asset, not as a one-off application.

## Implementation Order

1. Update or add specs before implementing behavior that changes architecture, security, permissions, data ownership, or module boundaries.
2. Add or update ADRs when a non-trivial technology or architecture decision changes.
3. Implement code only after the relevant spec exists and is accepted.

## Hard Rules

1. Preserve the modular monolith architecture. Do not introduce microservices, per-module deployments, or direct cross-module persistence writes.
2. Keep three first-class applications: public web, product app, and admin app.
3. Use Convex for interactive application state and file storage. Use PostgreSQL for audit, config, permission overrides, billing, metering, compliance records, and reporting-support workloads.
4. Treat field-level data access as a platform concern. No UI-only authorization. No hidden field exposure. Sensitive reads must be auditable.
5. All feature flags, permission scopes, projection profiles, and runtime configuration must be declared in module manifests and surfaced in the admin app. Effective runtime config and flag changes should not require redeploy when the declared schema already exists, and code-declared config must synchronize bidirectionally with PostgreSQL-backed runtime state. Code-side approval is the committed code change; database-side approval requires an authenticated user with the proper permissions.
6. Prefer open-source self-hostable dependencies with a realistic managed-service migration path.
7. Preserve end-to-end type safety. Effect and Effect Schema are the shared backbone for contracts, services, and environment modeling.
8. Prefer route-owned server data and Convex reactivity over broad client-state stores.
9. Reusable backend string vocabularies such as module ids, scopes, permissions, projection profiles, capabilities, config keys, feature-flag keys, shared host defaults, and platform adapter service names must live in shared named constants plus schemas. Do not retype them across runtime code or tests. This includes `configSchemaType.*` for config declaration schema types (`boolean`, `string`, `number`, `stringOrNull`), `projectionProfile.*` for projection profile names, `configDefaultValue.*` for sentinel default values like `"inherit"`, and `platformAdapterServiceName.*` for adapter service-name literals.
10. Split oversized literal registries by domain before they become catch-all files. Prefer thin compatibility barrels over monolithic source files.
11. When shared package roots start collecting many backend files, organize implementations into domain folders and keep the root limited to stable barrels or entrypoints.
12. Follow the existing shared-package folder taxonomies unless a spec or ADR changes them: contracts uses `access/`, `data/`, `module-registry/`, `runtime/`, and `domains/`; modules uses `access/`, `governance/`, `domains/`, and `persistence/`; platform adapters use `identity/`, `storage/`, `messaging/`, `observability/`, `features-billing/`, and `search/` behind `packages/platform/src/adapters/index.ts`; config manifests use `access/`, `governance/`, `domains/`, `communication/`, and `data/` under `packages/config/src/manifests/`; module spec docs use the same five domain groups under `specs/02-modules/`; platform specs use `architecture/`, `access/`, `security/`, `runtime/`, and `domains/` under `specs/01-platform/`; ADRs use `architecture/`, `storage/`, `identity/`, `runtime/`, `communication/`, and `domains/` under `specs/03-adr/`; tests use `contracts/`, `modules/`, and `platform/` under `tests/` with shared utilities like `type-assertions.ts` at the test root.
13. Organize for growth from day one. Create domain subfolders as soon as the first file in a concern area is added — never wait for accumulation to justify structure. The cost of an empty folder is zero; the cost of a retroactive reorganization is high.
14. Do not treat adapter stubs, placeholder snapshots, or in-memory scaffolds as completed capabilities. A capability only moves beyond scaffolded when the owning module, persistence or audit ownership, and operator workflow are explicit.
15. Governance-heavy flows such as runtime config, approvals, entitlements, billing, compliance, and audit must use durable PostgreSQL-backed state as the source of truth. In-memory state is limited to bounded cache-like concerns and local scaffolds.

## Backend Bias

1. Build and test backend capabilities first.
2. Treat frontend shells as thin adapters around typed backend contracts.
3. Keep app code dependent on shared platform packages instead of duplicating auth, config, and service logic inside each app.
4. Treat backend usability as the delivery gate. Frontend expansion stays secondary until shared runtime paths and operator workflows are usable end to end.

## Effect Usage

1. First-party runtime logic must prefer Effect services, layers, schemas, and `Effect.Effect` return values over ad hoc async helpers or plain object factories.
2. Derive exported shared types from Effect Schema where a schema exists instead of maintaining duplicate interface-only models.
3. Use `Schema.decodeUnknown` and Effect error channels in live runtime paths; when a live runtime function decodes input, preserve the concrete parse error type (for example `ParseResult.ParseError`) instead of widening the error channel to `unknown`. Reserve `Schema.decodeUnknownSync` for static module constant validation and tests.
4. For static schema-backed constants, use a compile-time typed value such as `value satisfies SchemaType` together with `Schema.validateSync(schema)(value)` so invalid literals fail in the editor before runtime.
5. Represent recoverable backend failures through typed Effect errors (using `_tag` discriminants) rather than raw `throw new Error(...)` in first-party runtime code.
6. Keep TanStack Start routes and server functions as thin framework adapters that call shared Effects and only use `Effect.runPromise(...)` at the framework boundary.
7. Do not hand-edit generated route tree files; generated `as any` casts in those files are tooling output, not a target for manual cleanup.
8. Use `Schema.NonEmptyString` instead of `Schema.String` for environment variables, API keys, URLs, adapter configuration, and identifiers or payload fields where an empty string is never valid.

## Security Invariants

1. Break-glass access must always validate `expiresAt` against the current time. An expired break-glass context must be denied, not silently accepted.
2. Fields classified as `regulated-sensitive` must be redacted for any actor that is not `platform-operator` or `support-operator`. This check must live in the field-security module, not in UI code.
3. Fields classified as `secret` must always be redacted regardless of actor type.
4. Anonymous actors must only see fields classified as `public`.
5. In-memory caches and request-volume collections must be bounded. Always set a `maxCacheSize` with expired-entry eviction when applicable, then oldest-entry eviction when the collection exceeds capacity.
6. Tenant isolation checks must deny cross-tenant access unless a valid, non-expired break-glass context exists for a privileged actor type.

## Test Discipline

1. Test fixtures and expectations must use shared constants (`platformModuleId.*`, `actorType.*`, `permissionScope.*`, `platformScope.*`, `dataClassification.*`, `projectionProfile.*`, `configSchemaType.*`) instead of raw strings. The only exception is raw strings used as decode inputs to explicitly test `Schema.decodeUnknown` boundary behavior.
2. Tests are organized under `tests/` with `contracts/`, `modules/`, and `platform/` subfolders. Shared fixtures live in module-scoped `_fixtures.ts` files. Compile-time type assertions live in `tests/type-assertions.ts`.
3. Every security-sensitive path (break-glass expiry, regulated-sensitive redaction, tenant isolation, cache eviction) must have explicit test coverage.
4. Run `bun run typecheck` and `bun run test` before considering any change complete.

## When Adding Code

1. Link the code change back to the relevant spec and ADR.
2. Update tests, docs, admin surfaces, and audit behavior when platform behavior changes.
3. If a module introduces flags, config, permissions, or sensitive fields, update its manifest in the same change.
4. Keep package `index.ts` files as export-only surfaces. Split backend contracts by concern and config manifests by module instead of growing monolithic registries.
5. When shared manifests export config-key or feature-flag constants, consume those exports in backend modules and tests rather than duplicating the string literal.
6. Prefer typed manifest helpers for module-scoped config keys, feature flags, runtime-value keys, and manifest definitions so prefix or ownership typos fail at compile time. Every manifest must use `platformModuleId.*` for `moduleId` and `owner`, `defineModuleConfigKeys` / `defineModuleFeatureFlags` for typed key constants, `permissionScope.*` for `permissionScopes`, `platformScope.*` for `allowedScopes`, `configSchemaType.*` for the `schema` field, `projectionProfile.*` for `profile` fields, and `configDefaultValue.*` for sentinel default values like `"inherit"`. Key helpers accept **suffixes only** (e.g. `"session.idleTimeoutMinutes"`) and automatically prepend `platformModuleId.*` at runtime, so the module ID is never duplicated in key literals.
7. Module field paths must be declared through named `...Fields` constants via `defineModuleFields(...)`, then consumed through `defineProjectionDescriptors(...)` and `defineDataClassificationDeclarations(...)` instead of inline string arrays. Reuse the same field constants in closely related field-security fixtures and tests when they describe the same fields.
8. When adding a new in-memory cache or collection that grows with request volume, include a size bound and eviction strategy from day one.
9. When adding environment or configuration schemas, use `Schema.NonEmptyString` for fields that must never be empty.
10. When a platform adapter or module method decodes runtime input with `Schema.decodeUnknown`, keep the parse error channel typed instead of widening it to `unknown`.
11. Prefer closing one vertical slice of adapter -> module/service -> operator workflow -> validation before adding more parallel stubs for new integrations.
12. Platform adapter service names and healthcheck schemas must use `packages/platform/src/adapters/service-names.ts` (`platformAdapterServiceName.*` and `createPlatformAdapterHealthcheckSchema(...)`) instead of repeating raw literals across adapter `serviceName` fields, healthcheck schemas, healthcheck payloads, or tests.
