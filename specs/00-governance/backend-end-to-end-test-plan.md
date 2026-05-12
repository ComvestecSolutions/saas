# Backend End-To-End Test Plan

Status: refreshed working plan

Last updated: 2026-05-12

## Objective

Establish one reusable backend-only end-to-end validation program that drives the Comvestec SaaS Foundation to a 100% working backend before any additional frontend scope resumes.

This plan is intentionally narrower than general application testing. It exists to make backend completion reviewable, repeatable, and trackable across sessions without letting browser or UI work blur the delivery bar.

`implementation-tracker.md` remains the maturity source of truth. This plan defines the current scope, transport rules, active phases, evidence bar, and the current next gaps for the backend e2e program.

## Backend-Only Scope Lock

1. This plan is backend-only. Browser automation, component behavior, client-state work, styling, visual polish, and other frontend expansion remain deferred.
2. The two transports in scope are both backend transports:
   - backend-owned HTTP mounted by `packages/platform/src/http/backend-api.ts`
   - first-party app server-side route and server-function boundaries over `packages/platform/src/services/apps/`
3. First-party app transport is included only as a backend boundary. It does not pull browser or UI behavior into the backend completion bar.
4. `packages/e2e/` remains browser-only and out of scope until this backend program is closed.
5. Backend completion must stand on shared services, durable state, backend transport coverage, typed tooling, and smoke evidence rather than on frontend behavior.

## Current State

### What already exists

1. Broad backend validation already exists in `tests/contracts/`, `tests/modules/`, and `tests/platform/`.
2. Backend-owned HTTP already has strong route-registration, OpenAPI, middleware, and transport-focused tests.
3. First-party app server-side boundaries already have focused route and server-function tests around auth, billing, product home bootstrap, and the admin tenant repair console.
4. A real backend-ready local smoke path already exists through:
   - `tooling/scripts/run-subscriber-journey-api.ts`
   - `tooling/scripts/subscriber-journey/ready.ts`
   - `tooling/scripts/subscriber-journey/live-smoke.ts`
5. The dedicated `tests/platform/backend-e2e/` lane now covers the currently audited backend-owned route families, including admin billing, import/export, search, workflow jobs, and backend-owned email-delivery provider-event handling, plus first-party app server-side parity where the same backend workflow is exposed through app boundaries.

### What is still missing

1. There is no current implementation blocker in the validated local backend lane. `bun run format:check`, `bun run typecheck`, `bun run test`, `bun run test:backend:e2e:local`, and the backend-ready smoke kickoff all complete successfully after aligning the local `POLAR_API_URL` override with the sandbox-scoped Polar organization access token.
2. Security invariants are now explicit in the backend-e2e lane rather than only transitive: no-session app-shell fallbacks, trusted-session spoofing denial, break-glass expiry and allow behavior, support-safe or secret field omission, cross-tenant denial, and webhook replay idempotency all have direct backend evidence and must stay explicit as future routes land.
3. Honest validated status now depends on keeping that full backend evidence bar green as the platform evolves.

## No-Duplication Transport Rule

1. Shared business assertions should be authored once in reusable scenario modules.
2. Transport drivers should only handle request execution, boundary-specific input shaping, and response normalization.
3. Every shared workflow must declare:
   - a primary transport for exhaustive coverage
   - a secondary transport for parity coverage
4. Duplicate deep suites are only justified when the two transports intentionally diverge in contract, boundary behavior, or error mapping.

## Current Transport Audit

| Capability group                  | Backend-owned HTTP surface                                                                                                             | First-party server-side surface                                             | Current evidence                                                                                                                                  | Planned e2e ownership                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform shell                    | Health, readiness, OpenAPI, docs, request middleware                                                                                   | None                                                                        | `tests/platform/backend-api*.test.ts`, readiness/live-smoke tooling                                                                               | Primary and exhaustive on backend-owned HTTP                                                                                                    |
| Subscriber auth kickoff           | Subscriber journey HTTP handlers                                                                                                       | Public-web auth start, product auth callback, stale-session transport       | `tests/platform/subscriber-journey-http.test.ts`, `tests/platform/app-auth-routes.test.ts`                                                        | Primary on backend-owned HTTP, parity on app server-side transport                                                                              |
| Public billing kickoff            | Subscriber journey and checkout-related HTTP handlers                                                                                  | Public-web billing checkout and return, product billing checkout and return | `tests/platform/subscriber-journey-http.test.ts`, `tests/platform/public-web-billing-routes.test.ts`, `tests/platform/app-billing-routes.test.ts` | Primary on backend-owned HTTP for shared billing workflow, parity on app server-side transport for signed handoff and request-boundary behavior |
| Product bootstrap                 | Subscriber journey HTTP handlers                                                                                                       | Product home route loader and server function                               | `tests/platform/subscriber-journey-http.test.ts`, `tests/platform/product-home-route.test.ts`                                                     | Primary on backend-owned HTTP, parity on product app server-side transport                                                                      |
| Governance and operator repair    | Admin governance, support operations, retention, admin billing HTTP handlers                                                           | Admin tenant repair route loader and server functions                       | `tests/platform/admin-governance*.test.ts`, `tests/platform/support-operations*.test.ts`, `tests/platform/admin-home-route.test.ts`               | Primary on backend-owned HTTP, targeted parity on admin app server-side transport                                                               |
| Domain and communication services | File storage, import/export, search, workflow jobs, email delivery, notification center, tenant branding, tenant invitations, webhooks | Limited or no first-party server-side exposure today                        | Focused platform and backend-api tests across `tests/platform/`                                                                                   | Primary on backend-owned HTTP unless a first-party server-side boundary is added                                                                |

## Active Implementation Phases

### Phase 1: Governance And Command Surface

1. Land this plan and keep it refreshed as the program progresses.
2. Add the dedicated `backend-e2e` Vitest project and the root command surface.
3. Wire the tracker, README, and specs index to the new plan.

### Phase 2: Shared Local-Stack Harness

1. Reuse the existing backend runtime and subscriber-journey bootstrap path instead of inventing a second local environment story.
2. Provide shared helpers for:
   - in-process backend API boot over real HTTP
   - local environment validation
   - response decoding
   - server-side route execution
   - synthetic session setup where deterministic paths require it

### Phase 3: Platform Shell And Shared Boundary Kickoff

1. Prove the platform shell over real backend-owned HTTP.
2. Prove the first shared server-side kickoff flows that do not require browser automation:
   - public auth start
   - public billing checkout kickoff
3. Keep this phase narrow enough that it can become the stable template for later route-family expansion.

### Phase 4: Route-Family Expansion

1. Subscriber journey
2. Governance and operator flows
3. Domain services
4. Communication services
5. Security invariants and durable-state assertions

### Phase 5: Live Smoke And Closeout

1. Keep deterministic local backend e2e and live provider smoke separate.
2. Reconcile the final plan, tracker, scripts, and evidence list.
3. Finish with repo-wide validation plus a distinct SaaS Foundation Steward pass.

## Initial Implementation Snapshot

The current implementation baseline for this plan is:

1. `test:backend:e2e` for direct backend e2e execution when the environment is already configured.
2. `test:backend:e2e:local` for the local operator path that reuses the existing subscriber-journey bootstrap plus Vault-backed environment loading.
3. `tests/platform/backend-e2e/` as the backend-only home for the new lane.
4. Shared Bun-probe helpers for running the real backend-owned HTTP runtime from the Node-side Vitest project without importing Bun-only modules into the test runtime.
5. Current real-backend coverage for:
   - backend API platform shell over real HTTP, including readiness, OpenAPI, docs, and subscriber-route method or not-found contracts
   - backend-owned subscriber-journey auth kickoff, public-plan listing, auth completion to product bootstrap, and cookie-backed request-context resolution on the local-stack path
   - backend-owned support-operations session-backed case upsert, list, tenant-health inspection, and trusted-session denial when only a body `sessionId` is provided
   - backend-owned retention legal-hold session-backed policy upsert, policy listing, legal-hold place/list/release, duplicate-hold conflict mapping, and trusted-session denial when only a body `sessionId` is provided
   - backend-owned admin-governance feature-flag listing, runtime-config override proposal submit/list/review, audit query and export flows, and trusted-session denial when only a body `sessionId` is provided
   - backend-owned billing webhook unsigned-delivery denial, missing-receipt replay not-found mapping, and repeated replay idempotent persistence over durable state
   - backend-owned admin-webhooks API access trusted-session denial, webhook subscription create/list, and webhook API key create/list/rotate/revoke flows over durable state
   - backend-owned admin-notification-center email-preference inspect/upsert flows with body-only session spoofing denial plus expired-versus-valid break-glass cross-tenant inspection evidence
   - backend-owned admin email-delivery tracking inspection with explicit cross-tenant break-glass expiry denial and valid break-glass allow evidence over durable state
   - backend-owned tenant-management invitation issue/list/revoke, authenticated invitation redemption, post-redemption membership inspection, and trusted-session denial on operator routes when only a body `sessionId` is provided
   - backend-owned admin tenant-branding custom-domain request and lifecycle transition, managed branding-asset publication, support-safe view projection, support-safe field omission, and trusted-session plus cross-tenant denial evidence over durable state
   - backend-owned file-storage upload reservation, blob upload and registration, list and download resolution, delete plus deleted-tombstone inspection, cookie-only backend-session denial, and cross-tenant access denial over the real mounted HTTP routes
   - backend-owned admin-billing repair-gap inspection, cancel, replay, and manual-reconciliation flows over durable workflow-job and audit state
   - backend-owned import/export export request flows over durable workflow-job state
   - backend-owned search tenant-index ensure/get/list/query/request-reindex/delete flows over durable search state
   - backend-owned workflow-jobs repair-gap list/cancel/replay flows over authenticated operator execution
   - backend-owned email-delivery provider-event verification for signed deliveries, ignored and unknown tracked messages, invalid signatures, invalid payload mapping, and durable tracking updates
   - first-party app server-side parity for public auth and checkout kickoff on the local-stack path
   - always-on first-party server-function shell fallbacks for product and admin route boundaries when no trusted session is present

## Evidence Bar

Backend completion is not honest until all of the following are green and the tracker reflects that reality:

1. `bun run format:check`
2. `bun run typecheck`
3. `bun run test`
4. `bun run test:backend:e2e:local` for the validated local operator path, or `bun run test:backend:e2e` when the backend environment is already configured outside the wrapper
5. `bun run backend:subscriber-journey:ready:local` or the equivalent current backend smoke evidence for provider-dependent flows

## Frontend Deferrals

The following remain explicitly out of scope until the backend e2e program reaches its completion bar:

1. Browser automation beyond the existing scaffold in `packages/e2e/`
2. New public-web UI expansion
3. New product-app UI expansion
4. New admin-app UI expansion outside the backend boundary coverage already needed for first-party server-side transport parity
5. Visual or client-behavior test programs

## Next Gaps

1. Keep local Polar operator guidance honest: when the active organization access token is sandbox-scoped, set `POLAR_API_URL=https://sandbox-api.polar.sh/v1` in `.env.local` instead of relying on the production default from `.env.example`.
2. Keep the current explicit field-redaction, tenant-isolation, trusted-session, break-glass, and idempotency assertions current so future route additions do not regress them behind only transitive coverage.
3. Keep shared workflows primary-on-one-transport and parity-on-the-other instead of drifting back into duplicated deep suites.
4. Preserve validated status by rerunning the full backend evidence bar after future route additions or local runtime credential rotations.
